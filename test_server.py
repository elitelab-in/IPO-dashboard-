from flask import Flask, jsonify
from backend.app import run_stock_analysis_internal

app = Flask(__name__)

@app.route('/')
def test():
    try:
        res = run_stock_analysis_internal('WIPRO', fast=False)
        return jsonify(res['advanced_fundamentals']['ipo'])
    except Exception as e:
        import traceback
        return jsonify({"error": str(e), "trace": traceback.format_exc()})

if __name__ == '__main__':
    from waitress import serve
    serve(app, host='0.0.0.0', port=5001)
