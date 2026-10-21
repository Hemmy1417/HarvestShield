# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }

import json

import genlayer as gl


OM = ("https://archive-api.open-meteo.com/v1/archive?latitude=9.06&longitude=7.49"
      "&start_date=2026-08-01&end_date=2026-08-14&daily=precipitation_sum&timezone=UTC")
NP = ("https://power.larc.nasa.gov/api/temporal/daily/point?parameters=PRECTOTCORR"
      "&community=AG&longitude=7.49&latitude=9.06&start=20260801&end=20260814&format=JSON")


def _totals() -> dict:
    out = {}
    try:
        r = gl.nondet.web.get(OM)
        d = json.loads(bytes(r.body).decode("utf-8"))
        vals = d["daily"]["precipitation_sum"]
        out["om"] = int(round(sum(v for v in vals if v is not None) * 10))
        out["om_days"] = len([v for v in vals if v is not None])
    except Exception as e:
        out["om_err"] = str(e)[:120]
    try:
        r = gl.nondet.web.get(NP)
        d = json.loads(bytes(r.body).decode("utf-8"))
        vals = list(d["properties"]["parameter"]["PRECTOTCORR"].values())
        out["np"] = int(round(sum(v for v in vals if v is not None and v > -900) * 10))
        out["np_days"] = len([v for v in vals if v is not None and v > -900])
    except Exception as e:
        out["np_err"] = str(e)[:120]
    return out


class Probe(gl.contract.Contract):
    result: str

    def __init__(self):
        self.result = ""

    @gl.public.write
    def run(self) -> str:
        def leader():
            mine = _totals()
            print("[PROBE] " + json.dumps(mine))
            return mine

        def validator(res) -> bool:
            if not isinstance(res, gl.vm.Return):
                return False
            mine = _totals()
            print("[PROBE] validator " + json.dumps(mine))
            return mine == res.calldata

        self.result = json.dumps(gl.vm.run_nondet(leader, validator))
        return self.result

    @gl.public.view
    def get(self) -> str:
        return self.result
