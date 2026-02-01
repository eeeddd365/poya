import os
import requests
from supabase import create_client

# 初始化 Supabase
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

CATEGORIES = {
    "紙棉用品": "374016",
    "居家清潔": "374018",
    "生活雜貨": "381590",
    "生活用品": "374020"
}

def get_poya_data():
    # 使用標準域名，不再使用 IP
    api_url = "https://api.poyabuy.com.tw/MobileApi/v1/SalePage/SearchList"
    
    headers = {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Referer": "https://www.poyabuy.com.tw/",
        "Origin": "https://www.poyabuy.com.tw"
    }

    for cat_name, cat_id in CATEGORIES.items():
        print(f"--- 📡 正在請求 API: {cat_name} ---")
        payload = {
            "ShopId": 1104,
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
                if items:
                    print(f"✅ {cat_name} 成功取得 {len(items)} 筆商品")
                    data_list = [{"title": i.get("Title").strip(), 
                                  "image_url": "https:" + i.get("CoverImageUrl") if i.get("CoverImageUrl").startswith("//") else i.get("CoverImageUrl"),
                                  "category": cat_name} for i in items if i.get("Title")]
                    
                    supabase.table("poya_items").upsert(data_list, on_conflict="title").execute()
                    print(f"💾 {cat_name} 資料已同步")
                else:
                    print(f"⚠️ 請求成功但沒資料")
            else:
                print(f"❌ API 失敗，狀態碼: {response.status_code}")
        except Exception as e:
            print(f"❌ 異常: {e}")

if __name__ == "__main__":
    get_poya_data()
