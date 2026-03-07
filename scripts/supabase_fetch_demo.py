"""
Minimal Python helper for manually checking rows inserted into Supabase.

Usage:
  SUPABASE_URL=... SUPABASE_ANON_KEY=... python scripts/supabase_fetch_demo.py
"""

import json
import os
import urllib.parse
import urllib.request


def fetch_rows(table: str, select_clause: str = '*', limit: int = 5):
    """Fetch rows from a Supabase table via PostgREST."""
    supabase_url = os.getenv('SUPABASE_URL', '').rstrip('/')
    supabase_anon_key = os.getenv('SUPABASE_ANON_KEY', '')

    if not supabase_url or not supabase_anon_key:
        raise RuntimeError('SUPABASE_URL and SUPABASE_ANON_KEY are required.')

    query = urllib.parse.urlencode({'select': select_clause, 'limit': limit})
    url = f"{supabase_url}/rest/v1/{table}?{query}"

    req = urllib.request.Request(
        url,
        headers={
            'apikey': supabase_anon_key,
            'Authorization': f'Bearer {supabase_anon_key}',
            'Accept': 'application/json',
        },
    )

    with urllib.request.urlopen(req) as response:
        body = response.read().decode('utf-8')
        return json.loads(body)


def main():
    """Fetch and print example rows from portfolio tables."""
    for table in ['portfolios', 'positions', 'price_history']:
        rows = fetch_rows(table)
        print(f'\nTable: {table}')
        print(json.dumps(rows, indent=2))


if __name__ == '__main__':
    main()
