import time
import logging
from functools import wraps
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
        """
        Enforces the configured minimum delay between calls for this RateLimiter instance in a thread-safe manner.
        
        Blocks the calling thread until at least self.delay seconds have elapsed since the previous recorded call, then updates the limiter's internal last_call timestamp. Logs a debug message including provider_name when it waits.
        """
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
        """
        Create a decorator that enforces the rate limit before calling the wrapped function.
        
        The returned wrapper preserves the wrapped function's metadata and calls self.wait() before invoking the original function.
        
        Parameters:
            func (callable): Function to be decorated.
        
        Returns:
            callable: A wrapper that enforces the limiter then calls `func`.
        """
        @wraps(func)
        def wrapper(*args, **kwargs):
            """
            Enforces the rate limiter before invoking the wrapped function with the original arguments.
            
            Parameters:
                *args: Positional arguments forwarded to the wrapped function.
                **kwargs: Keyword arguments forwarded to the wrapped function.
            
            Returns:
                The return value from the wrapped function.
            """
            self.wait()
            return func(*args, **kwargs)
        return wrapper
