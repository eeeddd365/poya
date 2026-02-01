import os
import requests
from supabase import create_client

# 初始化 Supabase
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# 分類 ID (保持不變)
CATEGORIES = {
    "紙棉用品": "374016",
    "居家清潔": "374018",
    "生活雜貨": "381590",
    "生活用品": "374020"
}

def get_poya_data():
    # 重點：將 api. 改成 www.，這是最穩定的主網站進入點
    api_url = "https://www.poyabuy.com.tw/MobileApi/v1/SalePage/SearchList"
    
    headers = {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Referer": "https://www.poyabuy.com.tw/",
        "Origin": "https://www.poyabuy.com.tw"
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
            # 使用 requests 發送 POST
            response = requests.post(api_url, json=payload, headers=headers, timeout=30)
            
            if response.status_code == 200:
                data = response.json()
                items = data.get("Data", {}).get("Entries", [])
                print(f"✅ {cat_name} 取得 {len(items)} 筆商品")
                
                data_list = []
                for item in items:
                    title = item.get("Title")
                    img = item.get("CoverImageUrl")
                    if title and img:
                        # 處理圖片連結補上 https:
                        clean_img = "https:" + img if img.startswith("//") else img
                        data_list.append({
                            "title": title.strip(),
                            "image_url": clean_img,
                            "category": cat_name
                        })

                if data_list:
                    # 寫入 Supabase (請確認 table 名稱為 poya_items)
                    supabase.table("poya_items").upsert(data_list, on_conflict="title").execute()
                    print(f"💾 {cat_name} 資料已存入 Supabase")
                else:
                    print(f"⚠️ API 回傳空資料，請檢查參數。")
            else:
                print(f"❌ API 請求失敗，狀態碼: {response.status_code}")
                # 印出部分內容協助偵錯
                print(f"內容節錄: {response.text[:100]}")
                
        except Exception as e:
            print(f"❌ 發生異常: {e}")

if __name__ == "__main__":
    get_poya_data()
