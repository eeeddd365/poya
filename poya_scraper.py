import os
import requests
from supabase import create_client
from requests.adapters import HTTPAdapter
from requests.packages.urllib3.util.ssl_ import create_urllib3_context

# 1. 強制設定 DNS 解析 (這會繞過系統 DNS)
# 將 api.poyabuy.com.tw 直接指向 Cloudflare 上的寶雅伺服器 IP
POYA_IP = "104.18.27.165"

class HostHeaderSSLAdapter(HTTPAdapter):
    def resolve_names(self, request, **kwargs):
        if "api.poyabuy.com.tw" in request.url:
            request.url = request.url.replace("api.poyabuy.com.tw", POYA_IP)
    def send(self, request, **kwargs):
        # 將 Host Header 補回去，這樣 SSL 和伺服器端才會通過
        request.headers['Host'] = "api.poyabuy.com.tw"
        return super().send(request, **kwargs)

# 2. 初始化 Supabase
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
    api_url = "https://api.poyabuy.com.tw/MobileApi/v1/SalePage/SearchList"
    
    # 建立一個 Session 並強行修改它的連線方式
    session = requests.Session()
    
    headers = {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Host": "api.poyabuy.com.tw" # 雙重保險
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
            # 直接在請求時把 URL 裡的域名換成 IP，但保留 Host Header
            # 這樣既能連上線，SSL 也不會報錯
            actual_url = api_url.replace("api.poyabuy.com.tw", POYA_IP)
            
            # verify=False 是因為連線對象是 IP，憑證會不匹配，但這不影響抓 JSON
            response = session.post(actual_url, json=payload, headers=headers, timeout=30, verify=False)
            
            if response.status_code == 200:
                data = response.json()
                items = data.get("Data", {}).get("Entries", [])
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

                if data_list:
                    supabase.table("poya_items").upsert(data_list, on_conflict="title").execute()
                    print(f"💾 {cat_name} 已存入 Supabase")
            else:
                print(f"❌ API 失敗，狀態碼: {response.status_code}")
        except Exception as e:
            print(f"❌ 最終異常: {e}")

if __name__ == "__main__":
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    get_poya_data()
