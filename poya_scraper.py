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
    # 使用 91APP 體系最底層、最不容易報 406 的 API 入口
    api_url = "https://api.poyabuy.com.tw/MobileApi/v1/SalePage/SearchList"
    
    # 深度偽裝 Header，模擬真正的 iPhone 請求
    headers = {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
        "Content-Type": "application/json;charset=UTF-8",
        "Origin": "https://www.poyabuy.com.tw",
        "Referer": "https://www.poyabuy.com.tw/",
        "X-Requested-With": "XMLHttpRequest"
    }

    for cat_name, cat_id in CATEGORIES.items():
        print(f"--- 📡 正在請求 API: {cat_name} (ID: {cat_id}) ---")
        
        payload = {
            "ShopId": 1104,
            "SalePageCategoryId": int(cat_id),
            "SortMode": "Sales",
            "PageIndex": 0,
            "PageSize": 40
        }

        try:
            # 使用 Session 保持連線特徵
            session = requests.Session()
            response = session.post(api_url, json=payload, headers=headers, timeout=30)
            
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
                    
                    # 存入 Supabase
                    supabase.table("poya_items").upsert(data_list, on_conflict="title").execute()
                    print(f"💾 {cat_name} 資料已存入 Supabase")
                else:
                    print(f"⚠️ API 成功但 Data 為空，內容: {response.text[:200]}")
            else:
                print(f"❌ API 失敗，狀態碼: {response.status_code}")
                # 提示：如果是 403/406，通常是 User-Agent 或 Header 被擋
                
        except Exception as e:
            print(f"❌ 異常: {e}")

if __name__ == "__main__":
    get_poya_data()
