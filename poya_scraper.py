import os
import time
from playwright.sync_api import sync_playwright
from supabase import create_client

# 環境變數
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# 寶雅分類 ID
CATEGORIES = {
    "紙棉用品": "260",
    "居家清潔": "261",
    "生活雜貨": "262",
    "生活用品": "263"
}

def scrape_poya():
    with sync_playwright() as p:
        # 啟動時加入更多偽裝參數
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            viewport={'width': 1920, 'height': 1080},
            extra_http_headers={
                "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7"
            }
        )
        page = context.new_page()

        for cat_name, cat_id in CATEGORIES.items():
            url = f"https://www.poyabuy.com.tw/v2/official/SalePageCategory/{cat_id}"
            print(f"🚀 正在進入分類: {cat_name}...")
            
            try:
                # 進入頁面，並多等幾秒讓 JavaScript 跑完
                page.goto(url, wait_until="networkidle", timeout=60000)
                page.wait_for_timeout(8000) 

                # 模擬人類向下滾動，這對觸發 Lazy Load 圖片很重要
                page.mouse.wheel(0, 1500)
                page.wait_for_timeout(2000)
                page.mouse.wheel(0, 1500)
                page.wait_for_timeout(2000)

                # 【核心改動】使用更廣泛的選取器，抓取所有看起來像商品的 A 連結
                # 寶雅的商品連結通常包含 'SalePage'
                product_links = page.locator("a[href*='SalePage']").all()
                print(f"🔍 網頁中偵測到 {len(product_links)} 個商品連結...")

                data_list = []
                for link in product_links:
                    try:
                        # 抓取連結內的文字作為標題
                        title = link.inner_text().split('\n')[0].strip()
                        # 抓取連結內的第一張圖片
                        img_element = link.locator("img").first
                        img_url = img_element.get_attribute("src") or img_element.get_attribute("data-src")

                        if title and img_url and len(title) > 2:
                            # 格式化圖片 URL
                            if img_url.startswith("//"):
                                img_url = "https:" + img_url
                            
                            # 排除掉廣告或小的 icon (通常小於 50 字元的網址可能不是商品圖)
                            if "static" not in img_url:
                                data_list.append({
                                    "title": title,
                                    "image_url": img_url,
                                    "category": cat_name
                                })
                    except:
                        continue
                
                # 移除重複的標題
                if data_list:
                    unique_data = {v['title']: v for v in data_list}.values()
                    print(f"💾 成功過濾出 {len(unique_data)} 筆有效商品，寫入 Supabase...")
                    supabase.table("poya_items").upsert(list(unique_data), on_conflict="title").execute()
                else:
                    print(f"❌ 無法抓取到商品內容，請檢查網站是否封鎖了 IP。")

            except Exception as e:
                print(f"❌ 發生錯誤: {e}")

        browser.close()

if __name__ == "__main__":
    scrape_poya()
