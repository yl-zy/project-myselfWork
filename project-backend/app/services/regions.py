"""省级行政区划码表（GB/T 2260 前两位）+ 人口权重

设计草案 §3.1：不建 region 表，码表作为常量放后端代码——演示数据不涉及行政区划维护。
weight 为人口规模的相对权重（约等于常住人口/百万），用于模拟数据生成时加权抽样，
保证流动榜单和流线粗细有真实感的差异。接口返回里也带上 name，前端无需自备码表。
"""

PROVINCES: list[dict] = [
    {"code": "11", "name": "北京", "weight": 22},
    {"code": "12", "name": "天津", "weight": 14},
    {"code": "13", "name": "河北", "weight": 74},
    {"code": "14", "name": "山西", "weight": 35},
    {"code": "15", "name": "内蒙古", "weight": 24},
    {"code": "21", "name": "辽宁", "weight": 42},
    {"code": "22", "name": "吉林", "weight": 24},
    {"code": "23", "name": "黑龙江", "weight": 31},
    {"code": "31", "name": "上海", "weight": 25},
    {"code": "32", "name": "江苏", "weight": 85},
    {"code": "33", "name": "浙江", "weight": 65},
    {"code": "34", "name": "安徽", "weight": 61},
    {"code": "35", "name": "福建", "weight": 42},
    {"code": "36", "name": "江西", "weight": 45},
    {"code": "37", "name": "山东", "weight": 101},
    {"code": "41", "name": "河南", "weight": 99},
    {"code": "42", "name": "湖北", "weight": 58},
    {"code": "43", "name": "湖南", "weight": 66},
    {"code": "44", "name": "广东", "weight": 126},
    {"code": "45", "name": "广西", "weight": 50},
    {"code": "46", "name": "海南", "weight": 10},
    {"code": "50", "name": "重庆", "weight": 32},
    {"code": "51", "name": "四川", "weight": 83},
    {"code": "52", "name": "贵州", "weight": 39},
    {"code": "53", "name": "云南", "weight": 47},
    {"code": "54", "name": "西藏", "weight": 4},
    {"code": "61", "name": "陕西", "weight": 40},
    {"code": "62", "name": "甘肃", "weight": 25},
    {"code": "63", "name": "青海", "weight": 6},
    {"code": "64", "name": "宁夏", "weight": 7},
    {"code": "65", "name": "新疆", "weight": 26},
]

PROVINCE_MAP: dict[str, str] = {p["code"]: p["name"] for p in PROVINCES}

MEAN_WEIGHT = sum(p["weight"] for p in PROVINCES) / len(PROVINCES)
