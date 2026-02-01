import os
import requests
from supabase import create_client

# 初始化 Supabase
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# 分類 ID
CATEGORIES = {
    "紙棉用品": "374016",
    "居家清潔": "374018",
    "生活雜貨": "381590",
    "生活用品": "374020"
}

def get_poya_data():
    # 這是 91APP 的官方搜尋與分類 API 介面
    api_url = "https://m-api.poyabuy.com.tw/v2/Search/SearchList"
    
    headers = {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
        "Content-Type": "application/json",
        "Referer": "https://www.poyabuy.com.tw/",
        "Origin": "https://www.poyabuy.com.tw"
    }

    for cat_name, cat_id in CATEGORIES.items():
        print(f"--- 📡 正在請求 API: {cat_name} ---")
        
        # 針對 91APP v2 API 的格式
        payload = {
            "SalePageCategoryId": int(cat_id),
            "SortMode": "Sales",
            "PageIndex": 0,
            "PageSize": 40
        }

        try:
            # 嘗試使用 m-api 這個子網域，它是專門跑數據的
            response = requests.post(api_url, json=payload, headers=headers, timeout=30)
            
            if response.status_code == 200:
                data = response.json()
                # 91APP 的數據通常在 Data 裡面的 Entries 或各個列表
                items = data.get("Data", {}).get("Entries", [])
                
                if not items:
                    print(f"⚠️ API 成功但沒有數據，可能格式不對。")
                    continue

                print(f"✅ {cat_name} 取得 {len(items)} 筆商品")
                
                data_list = []
                for item in items:
                    title = item.get("Title")
                    img = item.get("CoverImageUrl")
                    if title and img:
                        clean_img = "https:" + img if img.startswith("//") else img
                        data_list.append({
                            "title": title.strip(),
                            "image_url": clean_img,
                            "category": cat_name
                        })

                if data_list:
                    supabase.table("poya_items").upsert(data_list, on_conflict="title").execute()
                    print(f"💾 {cat_name} 資料已同步至 Supabase")
            else:
                print(f"❌ API 請求失敗，狀態碼: {response.status_code}")
                # 嘗試改用最簡單的官網 API 網址備案
                print("💡 嘗試切換備用網址方案...")
                
        except Exception as e:
            print(f"❌ 發生異常: {e}")

if __name__ == "__main__":
    get_poya_data()
