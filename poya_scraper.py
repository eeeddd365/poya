import os
import requests
import socket
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
    # 嘗試手動解析 IP，如果失敗就使用備用強勢 IP
    domain = "api.poyabuy.com.tw"
    try:
        target_ip = socket.gethostbyname(domain)
        print(f"🎯 DNS 解析成功: {domain} -> {target_ip}")
    except:
        target_ip = "104.18.27.165"  # 這是 Cloudflare 的節點 IP
        print(f"⚠️ DNS 解析失敗，使用強制備用 IP: {target_ip}")

    # 使用 IP 進行請求，但在 Header 帶上真實域名
    api_url = f"https://{target_ip}/MobileApi/v1/SalePage/SearchList"
    
    # 這裡是最核心的偽裝：我們必須讓 Cloudflare 覺得這是一次正常的 TLS 握手
    headers = {
        "Host": domain,
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
        "Content-Type": "application/json;charset=UTF-8",
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
            # 使用 Session 處理 SSL
            session = requests.Session()
            # 注意：verify=False 是因為我們用 IP 連連看，Cloudflare 的憑證會對不上
            # 但這對於抓資料沒關係，我們會關閉警告
            import urllib3
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
            
            response = session.post(api_url, json=payload, headers=headers, timeout=30, verify=False)
            
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
                    print(f"⚠️ API 回傳空列表，內容: {response.text[:100]}")
            else:
                print(f"❌ API 失敗，狀態碼: {response.status_code}，內容: {response.text[:100]}")
                
        except Exception as e:
            print(f"❌ 連線異常: {e}")

if __name__ == "__main__":
    get_poya_data()
