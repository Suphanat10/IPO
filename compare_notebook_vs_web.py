"""
Compare Notebook calculations vs Website (ipo.json) data.
Downloads same Google Sheets data as the notebooks, runs the same
calculations, then compares with ipo.json.
"""
import pandas as pd
import numpy as np
import json
import re
import itertools
import sys

SHEET_ID = '1EcrOSVscUJ4G9pjn9955oo_rPQK-d4m260lloNc74Vg'
GID_BASE = '0'
GID_FINANCIALS = '282921923'
GID_SECTOR = '1126418124'
GID_FA_NORM = '2043149918'

def get_sheet_url(sheet_id, gid):
    return f'https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid={gid}'

# ── 1. Load data from Google Sheets ──────────────────────────────
print("=== Downloading data from Google Sheets... ===")
df_base_raw = pd.read_csv(get_sheet_url(SHEET_ID, GID_BASE))
df_financials_raw = pd.read_csv(get_sheet_url(SHEET_ID, GID_FINANCIALS))
df_sector = pd.read_csv(get_sheet_url(SHEET_ID, GID_SECTOR))
fa_company_norm_df = pd.read_csv(get_sheet_url(SHEET_ID, GID_FA_NORM))
print(f"  base: {len(df_base_raw)} rows, financials: {len(df_financials_raw)} rows")

# ── 2. Load website data ─────────────────────────────────────────
print("\n=== Loading ipo.json from website... ===")
with open(r'D:\IPO\ipo-ui\src\app\data\ipo.json', 'r', encoding='utf-8') as f:
    web_data = json.load(f)
print(f"  faPersons: {len(web_data['faPersons'])}, faCompanies: {len(web_data['faCompanies'])}")
print(f"  leadUnderwriters: {len(web_data['leadUnderwriters'])}, leadCo: {len(web_data['leadCo'])}")

# ── 3. Notebook calculations (same as Cell 2) ────────────────────

def calculate_base_features(base_df):
    base = base_df.copy()
    base["open_above_ipo_d1"] = (base["open_d1"] > base["ipo_price"]).astype(int)
    base["high_above_ipo_d1"] = (base["high_d1"] > base["ipo_price"]).astype(int)
    base["low_above_ipo_d1"] = (base["low_d1"] > base["ipo_price"]).astype(int)
    base["close_above_ipo_d1"] = (base["close_d1"] > base["ipo_price"]).astype(int)
    base["return_open_d1"] = ((base["open_d1"] - base["ipo_price"]) / base["ipo_price"]) * 100
    base["return_high_d1"] = ((base["high_d1"] - base["ipo_price"]) / base["ipo_price"]) * 100
    base["return_low_d1"] = ((base["low_d1"] - base["ipo_price"]) / base["ipo_price"]) * 100
    base["return_close_d1"] = ((base["close_d1"] - base["ipo_price"]) / base["ipo_price"]) * 100
    base["intraday_range_d1"] = ((base["high_d1"] - base["low_d1"]) / base["ipo_price"]) * 100
    base["return_d1"] = base["return_close_d1"]
    for d in range(2, 6):
        base[f"return_d{d}"] = ((base[f"close_d{d}"] - base["ipo_price"]) / base["ipo_price"]) * 100
    for p in ["1W", "1M", "3M", "6M"]:
        base[f"return_{p}"] = np.where(
            base[f"close_{p}"].notna(),
            ((base[f"close_{p}"] - base["ipo_price"]) / base["ipo_price"]) * 100,
            np.nan
        )
    base["d1_up"] = (base["close_d1"] > base["ipo_price"]).astype(int)
    for d in range(2, 6):
        base[f"d{d}_up"] = (base[f"close_d{d}"] > base[f"close_d{d-1}"]).astype(int)
    base["d5_above_ipo"] = (base["close_d5"] > base["ipo_price"]).astype(int)
    return_cols = [f"return_d{d}" for d in range(1, 6)]
    base["max_return_week"] = base[return_cols].max(axis=1)
    base["min_return_week"] = base[return_cols].min(axis=1)
    base["year"] = pd.to_datetime(base["first_trade_date"]).dt.year
    return base

base = calculate_base_features(df_base_raw)

# ── FA lookup ─────────────────────────────────────────────────────
fa_lookup = fa_company_norm_df.copy()
def clean_key(text):
    if pd.isna(text):
        return ""
    text = str(text).lower()
    text = re.sub(r"\s+", "", text)
    return text
fa_lookup["lookup_key"] = fa_lookup["fa_companies"].apply(clean_key)
FA_LOOKUP_DICT = dict(zip(fa_lookup["lookup_key"], fa_lookup["fa_company_norm"]))

def normalize_fa_company_with_lookup(name):
    if pd.isna(name):
        return None
    key = clean_key(name)
    return FA_LOOKUP_DICT.get(key, None)

# ── Build FA persons ──────────────────────────────────────────────
def build_fa_persons(base_df):
    df = base_df.copy()
    df["fa_persons"] = (
        df["fa_persons"].astype(str)
        .str.replace("/", ",", regex=False)
        .str.split(",")
    )
    df = df.explode("fa_persons")
    df["fa_persons"] = (
        df["fa_persons"].str.strip()
        .str.replace(r"^(นาย|นางสาว|นาง|น\.ส\.|น\.ส|นส\.|นส)\s*", "", regex=True)
        .str.strip()
    )
    df = df[df["fa_persons"].notna() & (~df["fa_persons"].isin(["", "NA", "N.A.", "nan", "NaN"]))]
    return df.reset_index(drop=True)

def summarize_group(df, group_col):
    s = (
        df.groupby(group_col).agg(
            ipo_count=("symbol", "nunique"),
            prob_close_above_ipo=("close_above_ipo_d1", "mean"),
            prob_high_above_ipo=("high_above_ipo_d1", "mean"),
            prob_low_above_ipo=("low_above_ipo_d1", "mean"),
            prob_open_above_ipo=("open_above_ipo_d1", "mean"),
            best_return_d1=("return_close_d1", "max"),
            worst_return_d1=("return_close_d1", "min"),
            avg_return_open_d1=("return_open_d1", "mean"),
            avg_return_high_d1=("return_high_d1", "mean"),
            avg_return_low_d1=("return_low_d1", "mean"),
            avg_return_close_d1=("return_close_d1", "mean"),
            avg_intraday_range_d1=("intraday_range_d1", "mean"),
            avg_return_1W=("return_1W", "mean"),
            avg_return_1M=("return_1M", "mean"),
            avg_return_3M=("return_3M", "mean"),
            avg_return_6M=("return_6M", "mean"),
            prob_close_d5_above_ipo=("d5_above_ipo", "mean"),
            max_return_week=("max_return_week", "max"),
            min_return_week=("min_return_week", "min"),
        ).reset_index()
    )
    for col in ["prob_close_above_ipo", "prob_high_above_ipo", "prob_low_above_ipo",
                "prob_open_above_ipo", "prob_close_d5_above_ipo"]:
        s[col] *= 100
    return s

# ── Build FA companies ────────────────────────────────────────────
def build_fa_companies(base_df):
    df = base_df.copy()
    df["fa_companies"] = (
        df["fa_companies"].astype(str)
        .str.replace("/", ",", regex=False)
        .str.split(",")
    )
    df = df.explode("fa_companies")
    df["fa_companies"] = df["fa_companies"].str.strip()
    df = df[df["fa_companies"].notna() & (~df["fa_companies"].isin(["", "NA", "N.A.", "nan", "NaN", "-"]))]
    df["fa_company_norm"] = df["fa_companies"].apply(normalize_fa_company_with_lookup)
    return df.reset_index(drop=True)

# ── Build lead underwriters ───────────────────────────────────────
def build_lead_underwriters(base_df):
    df = base_df.copy()
    df["lead"] = (
        df["lead_underwriters_norm"].astype(str)
        .str.replace("[", "", regex=False).str.replace("]", "", regex=False)
        .str.replace("'", "", regex=False).str.replace("/", ",", regex=False)
        .str.split(",")
    )
    df = df.explode("lead")
    df["lead"] = df["lead"].str.strip()
    df = df[df["lead"].notna() & (~df["lead"].isin(["", "NA", "N.A.", "nan", "NaN", "-"]))]
    return df.reset_index(drop=True)

# ── Build lead-co ─────────────────────────────────────────────────
def build_lead_co(base_df):
    df = base_df.copy()
    df["lead_list"] = (
        df["lead_underwriters_norm"].astype(str)
        .str.replace("[", "", regex=False).str.replace("]", "", regex=False)
        .str.replace("'", "", regex=False).str.replace("/", ",", regex=False)
        .str.split(",")
    )
    df["co_list"] = (
        df["co_underwriters_norm"].astype(str)
        .str.replace("[", "", regex=False).str.replace("]", "", regex=False)
        .str.replace("'", "", regex=False).str.replace("/", ",", regex=False)
        .str.split(",")
    )
    def clean_list(x):
        return [i.strip() for i in x if i.strip() not in ["", "N.A.", "NA", "n.a.", "nan", "NaN", "-"]]
    df["lead_list"] = df["lead_list"].apply(clean_list)
    df["co_list"] = df["co_list"].apply(clean_list)

    rows = []
    for _, r in df.iterrows():
        if len(r["lead_list"]) == 0 or len(r["co_list"]) == 0:
            continue
        for lead, co in itertools.product(r["lead_list"], r["co_list"]):
            row = {"symbol": r["symbol"], "lead": lead, "co": co}
            for c in ["ipo_price", "open_d1", "high_d1", "low_d1", "close_d1",
                       "open_above_ipo_d1", "high_above_ipo_d1", "low_above_ipo_d1", "close_above_ipo_d1",
                       "return_open_d1", "return_high_d1", "return_low_d1", "return_close_d1",
                       "intraday_range_d1", "return_1W", "return_1M", "return_3M", "return_6M",
                       "d1_up", "d2_up", "d3_up", "d4_up", "d5_up",
                       "d5_above_ipo", "max_return_week", "min_return_week"]:
                if c in r.index:
                    row[c] = r[c]
            rows.append(row)
    return pd.DataFrame(rows)

def summarize_lead_co(df):
    s = (
        df.groupby(["lead", "co"]).agg(
            ipo_count=("symbol", "nunique"),
            prob_close_above_ipo=("close_above_ipo_d1", "mean"),
            prob_high_above_ipo=("high_above_ipo_d1", "mean"),
            prob_low_above_ipo=("low_above_ipo_d1", "mean"),
            prob_open_above_ipo=("open_above_ipo_d1", "mean"),
            best_return_d1=("return_close_d1", "max"),
            worst_return_d1=("return_close_d1", "min"),
            avg_return_open_d1=("return_open_d1", "mean"),
            avg_return_high_d1=("return_high_d1", "mean"),
            avg_return_low_d1=("return_low_d1", "mean"),
            avg_return_close_d1=("return_close_d1", "mean"),
            avg_intraday_range_d1=("intraday_range_d1", "mean"),
            avg_return_1W=("return_1W", "mean"),
            avg_return_1M=("return_1M", "mean"),
            avg_return_3M=("return_3M", "mean"),
            avg_return_6M=("return_6M", "mean"),
            prob_close_d5_above_ipo=("d5_above_ipo", "mean"),
            max_return_week=("max_return_week", "max"),
            min_return_week=("min_return_week", "min"),
        ).reset_index()
    )
    for col in ["prob_close_above_ipo", "prob_high_above_ipo", "prob_low_above_ipo",
                "prob_open_above_ipo", "prob_close_d5_above_ipo"]:
        s[col] *= 100
    return s

# ── Run calculations ──────────────────────────────────────────────
print("\n=== Running notebook calculations... ===")
fa_persons = build_fa_persons(base)
nb_fa_persons = summarize_group(fa_persons, "fa_persons")
fa_companies = build_fa_companies(base)
nb_fa_companies = summarize_group(fa_companies, "fa_company_norm")
lead_uw = build_lead_underwriters(base)
nb_lead_uw = summarize_group(lead_uw, "lead")
lead_co = build_lead_co(base)
nb_lead_co = summarize_lead_co(lead_co)

print(f"  Notebook FA Persons: {len(nb_fa_persons)}")
print(f"  Notebook FA Companies: {len(nb_fa_companies)}")
print(f"  Notebook Lead UW: {len(nb_lead_uw)}")
print(f"  Notebook Lead-Co: {len(nb_lead_co)}")

# ── 4. Comparison ─────────────────────────────────────────────────
METRICS = [
    "ipo_count", "prob_close_above_ipo", "prob_open_above_ipo",
    "avg_return_close_d1", "avg_return_open_d1",
    "best_return_d1", "worst_return_d1",
    "avg_return_1W", "avg_return_1M", "avg_return_3M", "avg_return_6M",
    "max_return_week", "min_return_week", "prob_close_d5_above_ipo"
]

TOLERANCE = 0.01  # allow 0.01% difference

def compare_dataset(name, nb_df, web_list, nb_name_col, web_name_key="name"):
    print(f"\n{'='*60}")
    print(f"  {name}")
    print(f"{'='*60}")
    print(f"  Notebook: {len(nb_df)} | Website: {len(web_list)}")

    web_dict = {}
    for item in web_list:
        k = item[web_name_key]
        if isinstance(k, list):
            k = tuple(k)
        web_dict[k] = item

    matched = 0
    mismatched = 0
    missing_web = 0
    missing_nb = 0
    diffs = []

    for _, row in nb_df.iterrows():
        if isinstance(nb_name_col, list):
            nb_name = tuple(row[c] for c in nb_name_col)
        else:
            nb_name = row[nb_name_col]

        if nb_name not in web_dict:
            missing_web += 1
            continue

        web_row = web_dict[nb_name]
        row_ok = True

        for metric in METRICS:
            if metric not in row.index:
                continue
            nb_val = row[metric]
            web_val = web_row.get(metric)

            if pd.isna(nb_val) and (web_val is None or (isinstance(web_val, float) and np.isnan(web_val))):
                continue

            if pd.isna(nb_val) or web_val is None:
                row_ok = False
                diffs.append((nb_name, metric, nb_val, web_val))
                continue

            if abs(float(nb_val) - float(web_val)) > TOLERANCE:
                row_ok = False
                diffs.append((nb_name, metric, float(nb_val), float(web_val)))

        if row_ok:
            matched += 1
        else:
            mismatched += 1

    nb_names = set()
    for _, row in nb_df.iterrows():
        if isinstance(nb_name_col, list):
            nb_names.add(tuple(row[c] for c in nb_name_col))
        else:
            nb_names.add(row[nb_name_col])
    for k in web_dict:
        if k not in nb_names:
            missing_nb += 1

    print(f"  Matched: {matched} | Mismatched: {mismatched}")
    print(f"  In notebook but not web: {missing_web} | In web but not notebook: {missing_nb}")

    if diffs:
        print(f"\n  Top differences (showing max 20):")
        print(f"  {'Name':<30} {'Metric':<25} {'Notebook':>12} {'Website':>12} {'Diff':>10}")
        print(f"  {'-'*89}")
        for name_val, metric, nb_v, web_v in diffs[:20]:
            nb_s = f"{nb_v:.4f}" if isinstance(nb_v, float) else str(nb_v)
            web_s = f"{web_v:.4f}" if isinstance(web_v, float) else str(web_v)
            diff = ""
            try:
                diff = f"{float(nb_v) - float(web_v):+.4f}"
            except:
                diff = "N/A"
            display_name = str(name_val)[:28]
            print(f"  {display_name:<30} {metric:<25} {nb_s:>12} {web_s:>12} {diff:>10}")

    return matched, mismatched, missing_web, missing_nb, diffs

# ── Run comparisons ───────────────────────────────────────────────
print("\n" + "=" * 60)
print("  COMPARISON: Notebook vs Website (ipo.json)")
print("=" * 60)

r1 = compare_dataset("FA Persons", nb_fa_persons, web_data["faPersons"], "fa_persons")
r2 = compare_dataset("FA Companies", nb_fa_companies, web_data["faCompanies"], "fa_company_norm")
r3 = compare_dataset("Lead Underwriters", nb_lead_uw, web_data["leadUnderwriters"], "lead")

# Lead-Co needs special handling (composite key)
web_lc = []
for item in web_data["leadCo"]:
    item_copy = dict(item)
    web_lc.append(item_copy)

# For lead-co, match on (lead=name, co=co)
print(f"\n{'='*60}")
print(f"  Lead-Co Underwriters")
print(f"{'='*60}")
print(f"  Notebook: {len(nb_lead_co)} | Website: {len(web_lc)}")

lc_web_dict = {}
for item in web_lc:
    lc_web_dict[(item["name"], item["co"])] = item

lc_matched = 0
lc_mismatched = 0
lc_diffs = []

for _, row in nb_lead_co.iterrows():
    key = (row["lead"], row["co"])
    if key not in lc_web_dict:
        continue
    web_row = lc_web_dict[key]
    row_ok = True
    for metric in METRICS:
        if metric not in row.index:
            continue
        nb_val = row[metric]
        web_val = web_row.get(metric)
        if pd.isna(nb_val) and (web_val is None or (isinstance(web_val, float) and np.isnan(web_val))):
            continue
        if pd.isna(nb_val) or web_val is None:
            row_ok = False
            lc_diffs.append((key, metric, nb_val, web_val))
            continue
        if abs(float(nb_val) - float(web_val)) > TOLERANCE:
            row_ok = False
            lc_diffs.append((key, metric, float(nb_val), float(web_val)))
    if row_ok:
        lc_matched += 1
    else:
        lc_mismatched += 1

print(f"  Matched: {lc_matched} | Mismatched: {lc_mismatched}")
if lc_diffs:
    print(f"\n  Top differences (showing max 20):")
    for name_val, metric, nb_v, web_v in lc_diffs[:20]:
        nb_s = f"{nb_v:.4f}" if isinstance(nb_v, float) else str(nb_v)
        web_s = f"{web_v:.4f}" if isinstance(web_v, float) else str(web_v)
        print(f"  {str(name_val)[:40]:<42} {metric:<25} NB={nb_s} WEB={web_s}")

# ── Summary ───────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("  OVERALL SUMMARY")
print("=" * 60)
total_matched = r1[0] + r2[0] + r3[0] + lc_matched
total_mismatched = r1[1] + r2[1] + r3[1] + lc_mismatched
total = total_matched + total_mismatched
pct = (total_matched / total * 100) if total > 0 else 0
print(f"  Total entities compared: {total}")
print(f"  Matched:    {total_matched} ({pct:.1f}%)")
print(f"  Mismatched: {total_mismatched} ({100-pct:.1f}%)")
if total_mismatched == 0:
    print("\n  ✓ ALL DATA MATCHES — Notebook and Website are consistent!")
else:
    print(f"\n  ✗ Found {total_mismatched} mismatches — see details above")
