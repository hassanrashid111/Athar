import os
import sys
import time
import random
import urllib.parse
import webbrowser
from flask import Flask, render_template, request, jsonify
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
from selenium.common.exceptions import WebDriverException, TimeoutException

try:
    import pyperclip
    HAS_CLIPBOARD = True
except ImportError:
    HAS_CLIPBOARD = False

def resource_path(relative_path):
    try:
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.abspath(".")
    return os.path.join(base_path, relative_path)

template_dir = resource_path('templates')
app = Flask(__name__, template_folder=template_dir)

driver = None

def log(text):
    print(f"[LOG]: {text}", flush=True)

def init_driver():
    global driver
    if driver is not None:
        try:
            driver.title 
            return driver
        except WebDriverException:
            driver = None

    log("🚀 Starting Chrome Driver...")
    if getattr(sys, 'frozen', False):
        application_path = os.path.dirname(sys.executable)
    else:
        application_path = os.path.dirname(os.path.abspath(__file__))
        
    profile_path = os.path.join(application_path, "chrome_data")
    
    options = webdriver.ChromeOptions()
    options.add_argument("--start-maximized")
    options.add_argument(f"user-data-dir={profile_path}")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--remote-allow-origins=*")
    options.add_argument("--disable-gpu")
    options.add_argument("--disable-software-rasterizer")
    options.add_argument("--disable-extensions")
    options.add_argument("--disable-infobars")
    options.page_load_strategy = 'eager' 
    
    try:
        driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)
        driver.get("https://web.whatsapp.com")
        return driver
    except Exception as e:
        log(f"❌ Chrome Error: {str(e)}")
        return None

@app.route('/')
@app.route('/login')
def login():
    return render_template('login.html')

@app.route('/setup')
def setup():
    return render_template('setup.html')

@app.route('/dashboard')
def dashboard():
    return render_template('dashboard.html')

@app.route('/reports')
def reports():
    return render_template('reports.html')

@app.route('/habits')
def habits():
    return render_template('habits.html')

@app.route('/api/send_whatsapp', methods=['POST'])
def send_whatsapp():
    global driver
    
    try:
        data = request.json
        students = data.get('students', [])
        message_text = data.get('message', '')
        include_name = data.get('include_name', True)
    except Exception as e:
        return jsonify({"status": "error", "message": f"Data Error: {str(e)}"})

    if not students:
        return jsonify({"status": "error", "message": "لا يوجد طلاب"})

    try:
        driver = init_driver()
        if not driver:
            return jsonify({"status": "error", "message": "فشل تشغيل المتصفح"})
            
        if "whatsapp" not in driver.current_url:
             driver.get("https://web.whatsapp.com")

        # انتظار تحميل القائمة الجانبية (دليل أن الواتساب فتح)
        try:
            WebDriverWait(driver, 60).until(
                EC.presence_of_element_located((By.XPATH, '//div[@id="side"]'))
            )
            log("✅ WhatsApp Loaded.")
        except:
            return jsonify({"status": "error", "message": "Time out: برجاء مسح الرمز المربع (QR) بسرعة"})
        
        sent_count = 0
        
        for i, student in enumerate(students):
            try:
                phone = student['phone'].replace('+', '').replace(' ', '').strip()
                if len(phone) < 5: 
                    log(f"⚠️ Skipping student {i+1}: Invalid phone '{phone}'")
                    continue 

                raw_name = student['name'].strip()
                first_name = raw_name.split()[0] if raw_name else "الطالب"
                
                log(f"🔄 Processing ({i+1}/{len(students)}): {first_name} ({phone})")

                # تجهيز الرسالة
                if "{الاسم}" in message_text:
                    full_msg = message_text.replace("{الاسم}", first_name)
                elif include_name:
                    full_msg = f"{first_name}،\n{message_text}"
                else:
                    full_msg = message_text

                # --- الخطوة 1: البحث عن الرقم ---
                try:
                    # محاولات متعددة للعثور على صندوق البحث لزيادة الموثوقية
                    search_box = WebDriverWait(driver, 10).until(
                        EC.element_to_be_clickable((By.XPATH, '//div[@contenteditable="true"][@data-tab="3"] | //div[@title="Search input textbox"]'))
                    )
                    
                    search_box.clear()
                    search_box.send_keys(Keys.CONTROL + "a")
                    search_box.send_keys(Keys.DELETE)
                    search_box.send_keys(phone)
                    time.sleep(2.0) # زيادة بسيط لوقت الانتظار لظهور النتائج
                    search_box.send_keys(Keys.ENTER)
                    
                    # --- الخطوة 2: التأكد من فتح الشات والكتابة ---
                    try:
                        # محاولات العثور على صندوق الكتابة (XPaths متنوعة لضمان العمل مع التحديثات)
                        main_input_xpath = '//div[@id="main"]//footer//div[@contenteditable="true"][@role="textbox"] | //div[@title="Type a message"]'
                        main_input_box = WebDriverWait(driver, 7).until(
                            EC.presence_of_element_located((By.XPATH, main_input_xpath))
                        )
                    except TimeoutException:
                        log(f"⚠️ Chat didn't open for {phone} (Contact not found or slow load).")
                        # محاولة تنظيف حالة البحث قبل الطالب التالي
                        try:
                            driver.find_element(By.TAG_NAME, 'body').send_keys(Keys.ESCAPE)
                            time.sleep(1)
                        except: pass
                        continue
                    
                    # الكتابة (اللصق أو المحاكاة)
                    if HAS_CLIPBOARD:
                        pyperclip.copy(full_msg)
                        main_input_box.send_keys(Keys.CONTROL + "v")
                        time.sleep(0.5)
                    else:
                        driver.execute_script("arguments[0].innerText = arguments[1];", main_input_box, full_msg)
                        main_input_box.send_keys(' ')
                        main_input_box.send_keys(Keys.BACKSPACE)

                    # --- الخطوة 3: الإرسال ---
                    time.sleep(1.5) 
                    main_input_box.send_keys(Keys.ENTER)

                    # حل احتياطي للضغط على زر الإرسال يدوياً
                    try:
                        send_button = driver.find_elements(By.XPATH, '//button[@aria-label="Send"] | //span[@data-icon="send"]/..')
                        if send_button:
                            send_button[0].click()
                            log("👉 Manual Send Triggered")
                    except: pass

                    sent_count += 1
                    log(f"✅ Success: Message sent to {first_name}")
                    
                    time.sleep(2.0) # فاصل زمني بين الطلاب

                except Exception as e:
                    log(f"⚠️ Inner Error with {first_name}: {str(e)}")
                    # العودة للحالة الطبيعية
                    try: driver.find_element(By.TAG_NAME, 'body').send_keys(Keys.ESCAPE)
                    except: pass
                    continue

            except Exception as e:
                log(f"❌ Error processing student index {i}: {str(e)}")
                continue

        return jsonify({"status": "success", "count": sent_count})

    except Exception as e:
        log(f"🔥 Server Error: {str(e)}")
        return jsonify({"status": "error", "message": str(e)})

if __name__ == '__main__':
    port = 5000
    url = f"http://127.0.0.1:{port}"
    chrome_paths = [
        'C:/Program Files/Google/Chrome/Application/chrome.exe %s',
        'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe %s'
    ]
    if not os.environ.get("WERKZEUG_RUN_MAIN"):
        opened = False
        for path in chrome_paths:
            try:
                webbrowser.get(path).open(url)
                opened = True
                break
            except: continue
        if not opened: webbrowser.open(url)
    app.run(debug=True, use_reloader=False, port=5000, host='0.0.0.0')
