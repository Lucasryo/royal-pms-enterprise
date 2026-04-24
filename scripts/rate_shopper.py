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
MAX_HOTELS = 20

# Termos que indicam claramente propriedades que NÃO são hotéis
NON_HOTEL_TERMS = [
    "flat", "apartamento", "apto", "hostel",
    "camping", "kitnet", "loft", "pousada",
]


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
        "&rows=80"                     # Busca 80 resultados para garantir 20 após filtro
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
        print(f"[booking] {len(cards)} cards encontrados — coletando até {MAX_HOTELS} hotéis.")

        for card in cards:
            if len(hotels) >= MAX_HOTELS:
                break
            try:
                name_el  = card.query_selector('[data-testid="title"]')
                price_el = card.query_selector('[data-testid="price-and-discounted-price"]')

                if not name_el:
                    continue

                name = name_el.inner_text().strip()

                # Segunda camada: descarta propriedades que não são hotéis pelo nome
                name_lower = name.lower()
                if any(term in name_lower for term in NON_HOTEL_TERMS):
                    print(f"  — ignorado: {name}")
                    continue

                # Extrai o texto completo do card e busca o preço por regex
                card_text = card.inner_text()

                # Debug: imprime o texto bruto do card (primeiros 300 chars)
                print(f"\n  [DEBUG CARD] {name}")
                print(f"  [RAW TEXT] {repr(card_text[:300])}")

                # Tenta extrair preço do texto do card com regex
                price = None
                price_matches = re.findall(r'R\$\s*([\d.,]+)', card_text)
                if price_matches:
                    print(f"  [PREÇOS ENCONTRADOS] {price_matches}")
                    price = parse_brl("R$ " + price_matches[0])

                hotels.append({"name": name, "price": price})
                print(f"  → SALVO: {name} | R$ {price}")

            except Exception as exc:
                print(f"  ✗ Erro ao processar card: {exc}")

        browser.close()

    return hotels


def save_to_supabase(hotels: list[dict]) -> None:
    print(f"\n[supabase] Conectando em {SUPABASE_URL[:40]}...")
    print(f"[supabase] Chave: {SUPABASE_KEY[:18]}...")

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    now = datetime.utcnow().isoformat()

    # Teste de leitura para confirmar conectividade
    try:
        test = supabase.table("rate_shopper_competitors").select("id").limit(1).execute()
        print(f"[supabase] Conexão OK — teste de leitura retornou {len(test.data)} registro(s).")
    except Exception as exc:
        print(f"[supabase] ERRO na conexão: {exc}")
        sys.exit(1)

    # Remove entradas antigas só depois de confirmar que há novos dados
    print(f"[supabase] Removendo entradas antigas do scraper...")
    try:
        del_res = supabase.table("rate_shopper_competitors") \
            .delete() \
            .eq("source", "booking_scraper") \
            .execute()
        print(f"[supabase] Delete OK.")
    except Exception as exc:
        print(f"[supabase] ERRO no delete: {exc}")

    # Insere os novos dados
    print(f"[supabase] Inserindo {len(hotels)} hotéis...")
    salvos = 0
    for hotel in hotels:
        if not hotel["name"]:
            continue
        try:
            ins = supabase.table("rate_shopper_competitors").insert({
                "name":             hotel["name"],
                "city":             CITY,
                "locality":         CITY,
                "source":           "booking_scraper",
                "observed_rate":    hotel["price"],
                "notes":            f"Captado automaticamente via Booking.com em {now[:10]}",
                "last_checked_at":  now,
            }).execute()
            salvos += 1
            print(f"  ✓ salvo: {hotel['name']}")
        except Exception as exc:
            print(f"  ✗ ERRO ao salvar {hotel['name']}: {exc}")

    print(f"\n[supabase] {salvos}/{len(hotels)} hotéis gravados com sucesso.")


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
