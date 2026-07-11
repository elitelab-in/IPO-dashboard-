import nsepython
ld = nsepython.nse_largedeals()
print(ld.columns.tolist())
print(ld.head(2).to_dict('records'))
