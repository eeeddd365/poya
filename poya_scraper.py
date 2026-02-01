import os
import requests
from supabase import create_client

# 1. 初始化 Supabase
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
    # 使用 ScraperAnt 或類似的免費轉發服務 (這裡我們先用最穩定的主域名 API)
    # 我們換一個 API 進入點，這個路徑通常對資料中心 IP 較寬鬆
    api_url = "https://www.poyabuy.com.tw/MobileApi/v1/SalePage/SearchList"
    
    headers = {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Origin": "https://www.poyabuy.com.tw",
        "Referer": "https://www.poyabuy.com.tw/"
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
            # 這是重點：我們直接請求主域名，並增加 timeout
            response = requests.post(api_url, json=payload, headers=headers, timeout=60)
            
            if response.status_code == 200:
                data = response.json()
                items = data.get("Data", {}).get("Entries", [])
                
                if items:
                    print(f"✅ {cat_name} 成功取得 {len(items)} 筆商品")
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
                    
                    supabase.table("poya_items").upsert(data_list, on_conflict="title").execute()
                    print(f"💾 {cat_name} 資料已更新至 Supabase")
                else:
                    print(f"⚠️ 請求成功但回傳空數據")
            else:
                print(f"❌ API 失敗，狀態碼: {response.status_code}")
                # 如果 403 或其他錯誤，這代表我們必須使用 Web 代理
                
        except Exception as e:
            print(f"❌ 發生異常: {e}")
            print("💡 提示：這代表 GitHub 環境完全無法連線至寶雅。")

if __name__ == "__main__":
    get_poya_data()
