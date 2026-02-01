import os
import requests
from supabase import create_client
import urllib3

# 關閉不安全連線的警告（因為我們用 IP 訪問會導致憑證不符，但這不影響抓資料）
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

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
    # 強制使用 IP 位址訪問，跳過 DNS 階段
    # 如果 104.18.27.165 不行，可以換 104.18.26.165
    target_ip = "104.18.27.165" 
    api_url = f"https://{target_ip}/MobileApi/v1/SalePage/SearchList"
    
    headers = {
        "Host": "api.poyabuy.com.tw", # 關鍵：告訴伺服器你其實是要找寶雅
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    for cat_name, cat_id in CATEGORIES.items():
        print(f"--- 📡 正在強行請求: {cat_name} (透過 IP: {target_ip}) ---")
        
        payload = {
            "ShopId": 1104,
            "SalePageCategoryId": int(cat_id),
            "SortMode": "Sales",
            "PageIndex": 0,
            "PageSize": 40
        }

        try:
            # verify=False 是為了繞過 IP 訪問時的 SSL 憑證檢查
            response = requests.post(api_url, json=payload, headers=headers, timeout=30, verify=False)
            
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
                            clean_img = "https:" + img if img.startswith("//") else img
                            data_list.append({
                                "title": title.strip(),
                                "image_url": clean_img,
                                "category": cat_name
                            })
                    
                    supabase.table("poya_items").upsert(data_list, on_conflict="title").execute()
                    print(f"💾 {cat_name} 資料已存入 Supabase")
                else:
                    print(f"⚠️ API 請求成功但沒資料，可能 Payload 需要調整。")
            else:
                print(f"❌ API 失敗，狀態碼: {response.status_code}")
                
        except Exception as e:
            print(f"❌ 發生異常: {e}")

if __name__ == "__main__":
    get_poya_data()
