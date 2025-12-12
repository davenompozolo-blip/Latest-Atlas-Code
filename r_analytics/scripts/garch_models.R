# ATLAS GARCH Models
# Advanced volatility modeling

library(rugarch)
library(xts)

#' Fit GARCH model and forecast volatility
#'
#' @param returns Numeric vector of returns
#' @param model_type GARCH variant
#' @param forecast_days Number of days to forecast
#' @return List with fitted model and forecasts
fit_garch <- function(returns, model_type = "sGARCH", forecast_days = 10) {

  # Specify model
  spec <- ugarchspec(
    variance.model = list(model = model_type, garchOrder = c(1, 1)),
    mean.model = list(armaOrder = c(0, 0), include.mean = TRUE)
  )

  # Fit model
  fit <- ugarchfit(spec = spec, data = returns)

  # Forecast
  forecast <- ugarchforecast(fit, n.ahead = forecast_days)

  # Extract results
  list(
    volatility = sigma(fit),
    forecast_vol = sigma(forecast),
    coefficients = coef(fit),
    model_type = model_type
  )
}

#' Calculate rolling GARCH volatility
rolling_garch <- function(returns, window = 252) {

  spec <- ugarchspec(
    variance.model = list(model = "sGARCH", garchOrder = c(1, 1)),
    mean.model = list(armaOrder = c(0, 0))
  )

  roll <- ugarchroll(
    spec = spec,
    data = returns,
    n.ahead = 1,
    forecast.length = length(returns) - window,
    refit.every = 20
  )

  sigma(roll)
}
