import os
import requests
from supabase import create_client

# 1. 初始化 Supabase (讀取你在 GitHub Secrets 設定的變數)
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# 2. 正確的分類 ID (寶雅最新 6 位數 ID)
CATEGORIES = {
    "紙棉用品": "374016",
    "居家清潔": "374018",
    "生活雜貨": "381590",
    "生活用品": "374020"
}

def get_poya_data():
    # 這是 91APP 的後端數據介面
    api_url = "https://api.poyabuy.com.tw/MobileApi/v1/SalePage/SearchList"
    headers = {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
        "Content-Type": "application/json"
    }

    for cat_name, cat_id in CATEGORIES.items():
        print(f"--- 📡 正在請求 API: {cat_name} ---")
        payload = {
            "SalePageCategoryId": int(cat_id),
            "SortMode": "Sales",
            "PageIndex": 0,
            "PageSize": 40
        }

        try:
            response = requests.post(api_url, json=payload, headers=headers, timeout=30)
            if response.status_code == 200:
                data = response.json()
                items = data.get("Data", {}).get("Entries", [])
                print(f"✅ 成功從 API 取得 {len(items)} 筆商品")
                
                data_list = []
                for item in items:
                    title = item.get("Title")
                    img = item.get("CoverImageUrl")
                    if title and img:
                        data_list.append({
                            "title": title.strip(),
                            "image_url": "https:" + img if img.startswith("//") else img,
                            "category": cat_name
                        })

                if data_list:
                    # 寫入 Supabase 表格 poya_items
                    supabase.table("poya_items").upsert(data_list, on_conflict="title").execute()
                    print(f"💾 {cat_name} 資料已存入 Supabase")
            else:
                print(f"❌ API 失敗，狀態碼: {response.status_code}")
        except Exception as e:
            print(f"❌ 發生異常: {e}")

if __name__ == "__main__":
    get_poya_data()
