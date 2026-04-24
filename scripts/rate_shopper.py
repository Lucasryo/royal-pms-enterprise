#!/usr/bin/env python3
"""
Rate Shopper — Booking.com
Roda diariamente via GitHub Actions às 8h BRT.
Salva os preços da concorrência direto no Supabase.
"""

import os
import re
import sys
from datetime import datetime, timedelta

from supabase import create_client, Client
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
CITY = "Macaé"
MAX_HOTELS = 10


def parse_brl(text: str) -> float | None:
    """Converte 'R$ 1.234,56' → 1234.56"""
    text = re.sub(r"[R$\s\n\t]", "", text)
    text = re.sub(r"\.(?=\d{3})", "", text)   # remove ponto de milhar
    text = text.replace(",", ".")
    match = re.search(r"\d+(?:\.\d+)?", text)
    if match:
        try:
            return float(match.group())
        except ValueError:
            return None
    return None


def scrape_booking() -> list[dict]:
    tomorrow   = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
    day_after  = (datetime.now() + timedelta(days=2)).strftime("%Y-%m-%d")

    url = (
        "https://www.booking.com/searchresults.pt-br.html"
        "?ss=Maca%C3%A9%2C+Rio+de+Janeiro%2C+Brasil"
        f"&checkin={tomorrow}"
        f"&checkout={day_after}"
        "&group_adults=2"
        "&no_rooms=1"
        "&order=review_score_and_price"
    )

    hotels: list[dict] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-blink-features=AutomationControlled",
            ],
        )
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            locale="pt-BR",
            timezone_id="America/Sao_Paulo",
            viewport={"width": 1280, "height": 900},
        )

        page = context.new_page()

        print(f"[booking] Buscando hotéis para {tomorrow} → {day_after}...")
        page.goto(url, wait_until="domcontentloaded", timeout=60_000)

        # Aceita cookies se o banner aparecer
        try:
            page.click('[id="onetrust-accept-btn-handler"]', timeout=6_000)
            print("[booking] Banner de cookies aceito.")
        except PlaywrightTimeout:
            pass

        # Aguarda cards de hotel
        try:
            page.wait_for_selector('[data-testid="property-card"]', timeout=35_000)
        except PlaywrightTimeout:
            print("[booking] Timeout: nenhum card encontrado.")
            browser.close()
            return hotels

        # Pequena pausa para preços carregarem via JS
        page.wait_for_timeout(2_500)

        cards = page.query_selector_all('[data-testid="property-card"]')
        print(f"[booking] {len(cards)} cards encontrados — processando até {MAX_HOTELS}.")

        for card in cards[:MAX_HOTELS]:
            try:
                name_el  = card.query_selector('[data-testid="title"]')
                price_el = card.query_selector('[data-testid="price-and-discounted-price"]')

                if not name_el:
                    continue

                name  = name_el.inner_text().strip()
                price = parse_brl(price_el.inner_text()) if price_el else None

                if name:
                    hotels.append({"name": name, "price": price})
                    price_str = f"R$ {price:.2f}" if price else "sem preço"
                    print(f"  ✓ {name} — {price_str}")

            except Exception as exc:
                print(f"  ✗ Erro ao processar card: {exc}")

        browser.close()

    return hotels


def save_to_supabase(hotels: list[dict]) -> None:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    now = datetime.utcnow().isoformat()

    # Remove entradas antigas do scraper antes de inserir as novas
    supabase.table("rate_shopper_competitors") \
        .delete() \
        .eq("source", "booking_scraper") \
        .execute()

    print(f"\n[supabase] Salvando {len(hotels)} hotéis...")

    for hotel in hotels:
        if not hotel["name"]:
            continue

        supabase.table("rate_shopper_competitors").insert({
            "name":             hotel["name"],
            "city":             CITY,
            "locality":         CITY,
            "source":           "booking_scraper",
            "observed_rate":    hotel["price"],
            "notes":            f"Captado automaticamente via Booking.com em {now[:10]}",
            "last_checked_at":  now,
        }).execute()

    print("[supabase] Concluído.")


if __name__ == "__main__":
    print(f"\n{'='*55}")
    print(f"  Rate Shopper  |  {datetime.now().strftime('%d/%m/%Y %H:%M')}")
    print(f"{'='*55}\n")

    hotels = scrape_booking()

    if not hotels:
        print("\n[erro] Nenhum hotel encontrado. Abortando.")
        sys.exit(1)

    save_to_supabase(hotels)
    print(f"\n✅  {len(hotels)} hotéis atualizados com sucesso.\n")
