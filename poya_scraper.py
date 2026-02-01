import os
import time
from playwright.sync_api import sync_playwright
from supabase import create_client

# 環境變數
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# 寶雅正確的分類 ID
CATEGORIES = {
    "紙棉用品": "260",
    "居家清潔": "261",
    "生活雜貨": "262",
    "生活用品": "263"
}

def scrape_poya():
    with sync_playwright() as p:
        # 使用 chromium 並偽裝 User-Agent
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
            viewport={'width': 1280, 'height': 800}
        )
        page = context.new_page()

        for cat_name, cat_id in CATEGORIES.items():
            url = f"https://www.poyabuy.com.tw/v2/official/SalePageCategory/{cat_id}"
            print(f"🚀 開始抓取分類: {cat_name} (ID: {cat_id})")
            
            try:
                # 延長等待時間並確保網頁完全讀取
                page.goto(url, wait_until="networkidle", timeout=60000)
                page.wait_for_timeout(5000)

                # 模擬真實人類滾動
                for i in range(3):
                    page.mouse.wheel(0, 1500)
                    time.sleep(2)

                # 抓取所有可能是商品卡片的元素 (改用更通用的選擇器)
                # 寶雅目前可能使用 .sc-... 或是 .product-card 類的名稱
                products = page.locator("[class*='ProductCard'], .product-card-m").all()
                print(f"找到 {len(products)} 個潛在商品元素")

                data_list = []
                for item in products:
                    try:
                        # 抓取標題和圖片
                        title = item.locator("[class*='title'], [class*='Name']").first.inner_text()
                        img_element = item.locator("img").first
                        img_url = img_element.get_attribute("src") or img_element.get_attribute("data-src")
                        
                        if title and img_url:
                            # 確保圖片網址完整
                            if img_url.startswith("//"):
                                img_url = "https:" + img_url
                                
                            data_list.append({
                                "title": title.strip(),
                                "image_url": img_url,
                                "category": cat_name
                            })
                    except:
                        continue
                
                # 寫入 Supabase
                if data_list:
                    print(f"💾 正在存入 {len(data_list)} 筆資料到 Supabase...")
                    supabase.table("poya_items").upsert(data_list, on_conflict="title").execute()
                else:
                    print(f"⚠️ 分類 {cat_name} 沒抓到任何商品，可能網站結構變更了。")

            except Exception as e:
                print(f"❌ 抓取 {cat_name} 時發生錯誤: {e}")

        browser.close()

if __name__ == "__main__":
    scrape_poya()
