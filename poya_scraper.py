import os
import json
from playwright.sync_api import sync_playwright
from supabase import create_client

# 環境變數
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# 分類對應名稱
CATEGORIES = {
    "260": "紙棉用品",
    "261": "居家清潔",
    "262": "生活雜貨",
    "263": "生活用品"
}

def scrape_poya():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # 模擬完全真實的手機瀏覽器
        context = browser.new_context(
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1"
        )
        page = context.new_page()

        all_products = []

        # 監聽後端 API 響應
        def handle_response(response):
            # 尋找包含商品清單的 API 網址 (91APP 常用關鍵字: SearchList)
            if "SearchList" in response.url and response.status == 200:
                try:
                    data = response.json()
                    # 91APP 的 JSON 結構通常在 Data.Entries 裡
                    items = data.get("Data", {}).get("Entries", [])
                    print(f"📡 攔截到 API 數據，取得 {len(items)} 個品項")
                    
                    for item in items:
                        title = item.get("Title")
                        # 取得高清原圖
                        img = item.get("CoverImageUrl")
                        if title and img:
                            all_products.append({
                                "title": title,
                                "image_url": "https:" + img if img.startswith("//") else img,
                                # 根據 URL 判斷分類，這裡稍後處理
                                "category": "未分類" 
                            })
                except Exception as e:
                    print(f"解析 API 錯誤: {e}")

        page.on("response", handle_response)

        for cat_id, cat_name in CATEGORIES.items():
            target_url = f"https://www.poyabuy.com.tw/v2/official/SalePageCategory/{cat_id}"
            print(f"🚀 正在開啟分類網址: {cat_name}...")
            
            # 訪問網址會觸發背景 API 調用
            page.goto(target_url, wait_until="networkidle", timeout=60000)
            page.wait_for_timeout(5000) # 多等一下讓 API 跑完
            
            # 標註分類
            for p_item in all_products:
                if p_item["category"] == "未分類":
                    p_item["category"] = cat_name

        # 寫入 Supabase
        if all_products:
            print(f"💾 總共取得 {len(all_products)} 筆資料，準備存入 Supabase...")
            # 去重
            unique_data = {v['title']: v for v in all_products}.values()
            supabase.table("poya_items").upsert(list(unique_data), on_conflict="title").execute()
            print("✅ 任務完成！")
        else:
            print("❌ 依然攔截不到數據。這代表寶雅封鎖了 GitHub 的連線。")

        browser.close()

if __name__ == "__main__":
    scrape_poya()
