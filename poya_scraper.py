import os
import time
from playwright.sync_api import sync_playwright
from supabase import create_client

# 1. 初始化 Supabase
# 請確保 GitHub Secrets 已設定 SUPABASE_URL 與 SUPABASE_KEY
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# 2. 定義正確的分類 ID (根據寶雅最新網址結構)
CATEGORIES = {
    "紙棉用品": "374016",
    "居家清潔": "374018",
    "生活雜貨": "381590",
    "生活用品": "374020"
}

def scrape_poya():
    with sync_playwright() as p:
        # 啟動 Chrome 瀏覽器
        browser = p.chromium.launch(headless=True)
        # 模擬真實使用者環境，避免被偵測為機器人
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            viewport={'width': 1280, 'height': 800}
        )
        page = context.new_page()

        for cat_name, cat_id in CATEGORIES.items():
            # 使用正確的網址格式並加上銷量排序，增加渲染成功率
            target_url = f"https://www.poyabuy.com.tw/v2/official/SalePageCategory/{cat_id}?sortMode=Sales"
            print(f"🚀 正在爬取分類: {cat_name} (ID: {cat_id})")
            
            try:
                # 訪問網址，等待網絡閒置
                page.goto(target_url, wait_until="networkidle", timeout=60000)
                
                # 給予額外時間讓動態元件（商品列表）生成
                page.wait_for_timeout(8000)

                # 模擬滾動，觸發 Lazy Load 載入更多商品圖
                page.mouse.wheel(0, 2000)
                page.wait_for_timeout(3000)

                # 抓取所有包含商品連結的 A 標籤 (91APP 核心特徵為 SalePage)
                product_nodes = page.locator("a[href*='SalePage']").all()
                print(f"🔍 偵測到 {len(product_nodes)} 個商品節點...")

                data_list = []
                for node in product_nodes:
                    try:
                        # 抓取標題 (通常在 A 標籤內部的文字)
                        # 我們取第一行非空的文字
                        full_text = node.inner_text().strip()
                        if not full_text: continue
                        title = full_text.split('\n')[0]

                        # 抓取圖片：先找 src，若無則找 data-src
                        img_el = node.locator("img").first
                        img_url = img_el.get_attribute("src") or img_el.get_attribute("data-src")

                        # 篩選條件：標題長度合理、圖片網址存在、且非裝飾用的小圖
                        if title and img_url and len(title) > 4:
                            # 補全網址協議
                            if img_url.startswith("//"):
                                img_url = "https:" + img_url
                            
                            # 排除非商品的靜態 icon 或廣告
                            if "static" not in img_url and "Banner" not in img_url:
                                data_list.append({
                                    "title": title,
                                    "image_url": img_url,
                                    "category": cat_name,
                                    "updated_at": "now()"
                                })
                    except:
                        continue

                # 將結果寫入 Supabase
                if data_list:
                    # 使用字典進行標題去重，避免重複寫入
                    unique_data = {v['title']: v for v in data_list}.values()
                    print(f"💾 正在將 {len(unique_data)} 筆資料存入 Supabase...")
                    
                    # 使用 upsert 根據 title (Primary Key) 更新或插入
                    supabase.table("poya_items").upsert(list(unique_data), on_conflict="title").execute()
                    print(f"✅ {cat_name} 抓取並更新完成。")
                else:
                    print(f"⚠️ {cat_name} 未抓到有效數據，請檢查網頁是否被擋。")

            except Exception as e:
                print(f"❌ 執行 {cat_name} 時發生錯誤: {e}")

        browser.close()

if __name__ == "__main__":
    scrape_poya()
