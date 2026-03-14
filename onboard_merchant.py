#!/usr/bin/env python3
"""
Merchant onboarding CLI: read a catalogue CSV and produce a UCP-ready data package.

Usage:
  python3 onboard_merchant.py --catalogue demo_data/catalogue.csv \\
    --merchant-name "Artisan India" --merchant-wallet 0x1234abcd... \\
    --output-dir ./deploy/artisan-india

Creates output_dir/data/ with products.csv, inventory.csv, shipping_rates.csv,
catalogue.json, and SQLite DBs. Creates output_dir/discovery_profile.json.
Run the UCP server with paths pointing to output_dir.
"""

import argparse
import csv
import json
import subprocess
import sys
from pathlib import Path

# Repo root: directory containing this script; rest/python/server is under it
REPO_ROOT = Path(__file__).resolve().parent
SERVER_DIR = REPO_ROOT / "rest" / "python" / "server"
INDIA_PROFILE_TEMPLATE = SERVER_DIR / "routes" / "discovery_profile_india.json"

REQUIRED_COLUMNS = {"id", "title", "price", "image_url"}
OPTIONAL_COLUMNS = {
    "description",
    "category",
    "origin_state",
    "artisan_name",
    "inventory_quantity",
}

DEFAULT_INVENTORY = 100

# Shipping rates (price in USD cents)
INDIAN_SHIPPING_RATES = [
    ("std-in", "IN", "standard", 500, "Standard Shipping (India)"),
    ("exp-in", "IN", "express", 1200, "Express Shipping (India)"),
    ("std-default", "default", "standard", 500, "Standard Shipping"),
    ("exp-default", "default", "express", 1500, "International Express"),
]


def main() -> None:
    p = argparse.ArgumentParser(
        description="Onboard a merchant: CSV catalogue -> UCP data package"
    )
    p.add_argument(
        "--catalogue",
        required=True,
        help="Path to merchant catalogue CSV (id, title, price, image_url, ...)",
    )
    p.add_argument("--merchant-name", required=True, help="Merchant display name")
    p.add_argument(
        "--merchant-wallet",
        required=True,
        help="Merchant EVM wallet address (e.g. 0x1234...abcd)",
    )
    p.add_argument(
        "--output-dir",
        required=True,
        help="Output directory for data and discovery profile",
    )
    args = p.parse_args()

    catalogue_path = Path(args.catalogue)
    if not catalogue_path.exists():
        print(f"Error: catalogue file not found: {catalogue_path}", file=sys.stderr)
        sys.exit(1)

    output_dir = Path(args.output_dir)
    data_dir = output_dir / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    # 1) Read and validate CSV
    rows: list[dict[str, str]] = []
    with catalogue_path.open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames or []
        missing = REQUIRED_COLUMNS - set(headers)
        if missing:
            print(
                f"Error: catalogue CSV missing required columns: {missing}",
                file=sys.stderr,
            )
            sys.exit(1)
        for row in reader:
            rows.append(row)

    if not rows:
        print("Error: no data rows in catalogue CSV", file=sys.stderr)
        sys.exit(1)

    # 2) products.csv (id, title, price, image_url)
    products_path = data_dir / "products.csv"
    with products_path.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["id", "title", "price", "image_url"])
        for r in rows:
            w.writerow([
                r["id"],
                r["title"],
                r["price"],
                r.get("image_url", ""),
            ])

    # 3) inventory.csv
    inventory_path = data_dir / "inventory.csv"
    with inventory_path.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["product_id", "quantity"])
        for r in rows:
            qty = r.get("inventory_quantity", str(DEFAULT_INVENTORY))
            try:
                int(qty)
            except ValueError:
                qty = str(DEFAULT_INVENTORY)
            w.writerow([r["id"], qty])

    # 4) shipping_rates.csv
    shipping_path = data_dir / "shipping_rates.csv"
    with shipping_path.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["id", "country_code", "service_level", "price", "title"])
        for t in INDIAN_SHIPPING_RATES:
            w.writerow(t)

    # 5) catalogue.json (rich metadata for /catalogue and /products)
    catalogue_list = []
    for r in rows:
        entry = {
            "id": r["id"],
            "title": r["title"],
            "price": int(r["price"]),
            "image_url": r.get("image_url", ""),
        }
        if r.get("description"):
            entry["description"] = r["description"]
        if r.get("category"):
            entry["category"] = r["category"]
        if r.get("origin_state"):
            entry["origin_state"] = r["origin_state"]
        if r.get("artisan_name"):
            entry["artisan_name"] = r["artisan_name"]
        catalogue_list.append(entry)
    with (data_dir / "catalogue.json").open("w", encoding="utf-8") as f:
        json.dump(catalogue_list, f, indent=2)

    # 6) discovery_profile.json from India template
    if not INDIA_PROFILE_TEMPLATE.exists():
        print(
            f"Warning: India template not found at {INDIA_PROFILE_TEMPLATE}; "
            "skipping discovery profile.",
            file=sys.stderr,
        )
    else:
        template = INDIA_PROFILE_TEMPLATE.read_text(encoding="utf-8")
        categories = set()
        for r in rows:
            if r.get("category"):
                categories.add(r["category"])
        product_categories = ", ".join(sorted(categories)) or "general"

        profile_text = (
            template.replace("{{MERCHANT_NAME}}", args.merchant_name)
            .replace("{{MERCHANT_WALLET}}", args.merchant_wallet)
            .replace("{{PRODUCT_CATEGORIES}}", product_categories)
        )
        # Keep {{ENDPOINT}} and {{SHOP_ID}} for server runtime
        discovery_path = output_dir / "discovery_profile.json"
        discovery_path.write_text(profile_text, encoding="utf-8")

    # 7) Run import_csv to create SQLite DBs (use absolute paths).
    # Use uv run so server dependencies (absl, db, etc.) are available.
    products_db = data_dir.resolve() / "products.db"
    transactions_db = data_dir.resolve() / "transactions.db"
    data_dir_abs = data_dir.resolve()
    import_cmd = [
        "uv",
        "run",
        "--no-project",
        "--with", "absl-py",
        "--with", "sqlalchemy",
        "--with", "aiosqlite",
        "--with", "greenlet",
        "python",
        "import_csv.py",
        f"--products_db_path={products_db}",
        f"--transactions_db_path={transactions_db}",
        f"--data_dir={data_dir_abs}",
    ]
    try:
        subprocess.run(
            import_cmd,
            cwd=str(SERVER_DIR),
            check=True,
            capture_output=True,
            text=True,
        )
    except subprocess.CalledProcessError as e:
        print(
            f"Error running import_csv: {e.stderr or e}",
            file=sys.stderr,
        )
        sys.exit(1)

    # 8) Summary
    print(f"Onboarded {len(rows)} products.")
    print(f"Data directory: {data_dir}")
    print(f"Discovery profile: {output_dir / 'discovery_profile.json'}")
    print()
    print("Run the UCP server from the repo root:")
    print(
        f"  uv run python rest/python/server/server.py "
        f"--products_db_path={data_dir / 'products.db'} "
        f"--transactions_db_path={data_dir / 'transactions.db'} "
        f"--discovery_profile_path={output_dir / 'discovery_profile.json'} "
        "--port=8000"
    )


if __name__ == "__main__":
    main()
