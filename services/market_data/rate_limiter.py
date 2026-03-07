import time
import logging
from threading import Lock
logger = logging.getLogger(__name__)
class RateLimiter:
    """
    Thread-safe rate limiter for API calls.
    Enforces a minimum delay between calls based on calls_per_minute.
    """
    def __init__(self, calls_per_minute: int, provider_name: str = ""):
        self.delay = 60.0 / calls_per_minute
        self.provider_name = provider_name
        self.last_call = 0.0
        self._lock = Lock()
    def wait(self):
        with self._lock:
            elapsed = time.time() - self.last_call
            if elapsed < self.delay:
                wait_time = self.delay - elapsed
                logger.debug(
                    f"[{self.provider_name}] Rate limit: waiting {wait_time:.2f}s"
                )
                time.sleep(wait_time)
            self.last_call = time.time()
    def __call__(self, func):
        """Allow use as a decorator."""
        def wrapper(*args, **kwargs):
            self.wait()
            return func(*args, **kwargs)
        return wrapper
