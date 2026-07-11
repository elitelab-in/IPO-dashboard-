import nsepython
from datetime import datetime, timedelta

try:
    print("Testing nse_largedeals_historical():")
    # Usually it takes start_date and end_date. Let's try to find its signature.
    import inspect
    print(inspect.signature(nsepython.nse_largedeals_historical))
except Exception as e:
    print("Error:", e)
