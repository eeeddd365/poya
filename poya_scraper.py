import os
import requests
from supabase import create_client

# 1. 初始化 Supabase
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# 2. 定義分類 ID (這是目前最準確的 ID)
CATEGORIES = {
    "紙棉用品": "374016",
    "居家清潔": "374018",
    "生活雜貨": "381590",
    "生活用品": "374020"
}

def get_poya_data():
    # 這是 91APP 體系通用的 API 進入點
    api_url = "https://api.poyabuy.com.tw/MobileApi/v1/SalePage/SearchList"
    
    # 模擬真實手機 APP 的請求標頭
    headers = {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
        "Content-Type": "application/json",
        "Origin": "https://www.poyabuy.com.tw",
        "Referer": "https://www.poyabuy.com.tw/"
    }

    for cat_name, cat_id in CATEGORIES.items():
        print(f"📡 正在請求 API: {cat_name}...")
        
        # 這是 API 需要的參數 (關鍵在於 SalePageCategoryId)
        payload = {
            "SalePageCategoryId": int(cat_id),
            "SortMode": "Sales",
            "PageIndex": 0,
            "PageSize": 40  # 一次抓 40 筆
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
                    img_url = item.get("CoverImageUrl")
                    
                    if title and img_url:
                        # 處理網址協議
                        if img_url.startswith("//"):
                            img_url = "https:" + img_url
                            
                        data_list.append({
                            "title": title,
                            "image_url": img_url,
                            "category": cat_name
                        })

                if data_list:
                    # 批次寫入 Supabase
                    supabase.table("poya_items").upsert(data_list, on_conflict="title").execute()
                    print(f"💾 {cat_name} 已更新到 Supabase")
            else:
                print(f"❌ API 請求失敗，狀態碼: {response.status_code}")
                
        except Exception as e:
            print(f"❌ 發生異常: {e}")

if __name__ == "__main__":
    get_poya_data()
