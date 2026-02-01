import os
import requests
import urllib3
from supabase import create_client

# 1. 禁用 SSL 警告 (因為強制對應 IP 可能會觸發)
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# 2. 這是最核心的破解邏輯：手動強制 DNS 解析
# 我們攔截 requests 的底層連線，直接把域名換成 IP，但維持 SSL 握手時的域名資訊
def force_dns_resolve():
    import requests.packages.urllib3.util.connection as alt_connection
    
    # 這是 api.poyabuy.com.tw 目前在 Cloudflare 上的 IP
    # 如果這個 IP 未來失效，只需更換這裡
    POYA_IP = "104.18.27.165" 
    
    _orig_getaddrinfo = alt_connection.socket.getaddrinfo
    
    def patched_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
        if host == "api.poyabuy.com.tw":
            # 強制將域名導向特定 IP，跳過系統 DNS 查詢
            return _orig_getaddrinfo(POYA_IP, port, family, type, proto, flags)
        return _orig_getaddrinfo(host, port, family, type, proto, flags)
    
    alt_connection.socket.getaddrinfo = patched_getaddrinfo

# 執行 DNS 注入
force_dns_resolve()

# 3. 初始化 Supabase
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
    # 使用原始域名，注入後的 socket 會自動幫我們找到 IP
    api_url = "https://api.poyabuy.com.tw/MobileApi/v1/SalePage/SearchList"
    
    headers = {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Referer": "https://www.poyabuy.com.tw/",
        "Host": "api.poyabuy.com.tw"
    }

    for cat_name, cat_id in CATEGORIES.items():
        print(f"--- 📡 正在請求 API: {cat_name} (透過 DNS 注入) ---")
        payload = {
            "ShopId": 1104,
            "SalePageCategoryId": int(cat_id),
            "SortMode": "Sales",
            "PageIndex": 0,
            "PageSize": 40
        }

        try:
            # 這裡 verify 設為 True，因為我們注入的是底層 socket，SSL 握手應該會正常
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
                else:
                    print(f"⚠️ 請求成功但回傳空數據")
            else:
                print(f"❌ API 失敗，狀態碼: {response.status_code}")
        except Exception as e:
            print(f"❌ 注入後連線異常: {e}")

if __name__ == "__main__":
    get_poya_data()
