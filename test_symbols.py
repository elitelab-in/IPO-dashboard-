import nsepython
try:
    ld = nsepython.nse_largedeals()
    if isinstance(ld, dict) and 'data' in ld:
        data = ld['data']
    elif hasattr(ld, 'to_dict'):
        data = ld.to_dict('records')
    else:
        data = []
        
    for i in range(min(5, len(data))):
        print(repr(data[i]['symbol']))
except Exception as e:
    print(e)
except Exception as e:
    print(e)
