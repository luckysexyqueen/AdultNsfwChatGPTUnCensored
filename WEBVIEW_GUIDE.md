# WebView 앱 변환 가이드

이 문서는 이 HTML 앱을 Android WebView 앱(APK)으로 변환할 때 **다중 파일 업로드(Multiple File Input)**를 정상 작동시키기 위한 설정 가이드입니다.

---

## 📱 WebView 앱 변환 서비스

- **WebIntoApp**: https://www.webintoapp.com
- **AppsGeyser**: https://appsgeyser.com
- **Appy Pie**: https://www.appypie.com

---

## ⚠️ 중요: Multiple File Input 지원 설정

기본 WebView 설정으로는 `<input type="file" multiple>`이 작동하지 않습니다.
아래 Android 코드를 **반드시** 추가해야 합니다.

---

## 🔧 Android WebView 설정 (Java)

### MainActivity.java

```java
package com.yourapp.chatgpt;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private final int FILE_CHOOSER_REQUEST_CODE = 1;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webview);
        
        // WebView 기본 설정
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);              // JavaScript 활성화
        settings.setDomStorageEnabled(true);              // localStorage 활성화
        settings.setAllowFileAccess(true);                // 파일 접근 허용
        settings.setAllowContentAccess(true);             // Content URI 접근 허용
        settings.setAllowFileAccessFromFileURLs(false);   // 보안 설정
        settings.setAllowUniversalAccessFromFileURLs(false);

        // WebViewClient 설정 (페이지 로딩)
        webView.setWebViewClient(new WebViewClient());

        // ⭐ 핵심: 파일 선택 지원 (Multiple File Input)
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                WebView webView,
                ValueCallback<Uri[]> filePathCallback,
                FileChooserParams fileChooserParams
            ) {
                // 기존 콜백 초기화
                if (MainActivity.this.filePathCallback != null) {
                    MainActivity.this.filePathCallback.onReceiveValue(null);
                }
                MainActivity.this.filePathCallback = filePathCallback;

                // 파일 선택 Intent 생성
                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");  // 모든 파일 형식 허용
                
                // ⭐⭐⭐ 다중 파일 선택 활성화
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);

                try {
                    startActivityForResult(
                        Intent.createChooser(intent, "파일 선택"),
                        FILE_CHOOSER_REQUEST_CODE
                    );
                } catch (Exception e) {
                    MainActivity.this.filePathCallback = null;
                    return false;
                }

                return true;
            }
        });

        // HTML 파일 로드
        webView.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode == FILE_CHOOSER_REQUEST_CODE) {
            if (filePathCallback == null) return;

            Uri[] results = null;

            if (resultCode == RESULT_OK && data != null) {
                String dataString = data.getDataString();
                ClipData clipData = data.getClipData();

                if (clipData != null) {
                    // ⭐ 다중 파일 처리
                    int count = clipData.getItemCount();
                    results = new Uri[count];
                    for (int i = 0; i < count; i++) {
                        results[i] = clipData.getItemAt(i).getUri();
                    }
                } else if (dataString != null) {
                    // 단일 파일 처리
                    results = new Uri[]{Uri.parse(dataString)};
                }
            }

            // 콜백으로 결과 전달
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
```

---

## 🔧 Android WebView 설정 (Kotlin)

### MainActivity.kt

```kotlin
package com.yourapp.chatgpt

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private val FILE_CHOOSER_REQUEST_CODE = 1

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webview)
        
        // WebView 기본 설정
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = true
            allowContentAccess = true
        }

        webView.webViewClient = WebViewClient()

        // ⭐ 파일 선택 지원
        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                this@MainActivity.filePathCallback?.onReceiveValue(null)
                this@MainActivity.filePathCallback = filePathCallback

                val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                    // ⭐⭐⭐ 다중 파일 선택 활성화
                    putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                }

                startActivityForResult(
                    Intent.createChooser(intent, "파일 선택"),
                    FILE_CHOOSER_REQUEST_CODE
                )

                return true
            }
        }

        webView.loadUrl("file:///android_asset/index.html")
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)

        if (requestCode == FILE_CHOOSER_REQUEST_CODE) {
            val results = if (resultCode == RESULT_OK && data != null) {
                val clipData = data.clipData
                if (clipData != null) {
                    // ⭐ 다중 파일 처리
                    Array(clipData.itemCount) { i ->
                        clipData.getItemAt(i).uri
                    }
                } else {
                    data.dataString?.let { arrayOf(Uri.parse(it)) }
                }
            } else null

            filePathCallback?.onReceiveValue(results)
            filePathCallback = null
        }
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
```

---

## 📋 AndroidManifest.xml 권한 설정

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.yourapp.chatgpt">

    <!-- 인터넷 권한 -->
    <uses-permission android:name="android.permission.INTERNET" />
    
    <!-- 파일 접근 권한 -->
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
    
    <!-- Android 13+ 미디어 권한 -->
    <uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
    <uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />
    <uses-permission android:name="android.permission.READ_MEDIA_AUDIO" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="NSFW AI Chat"
        android:theme="@style/AppTheme"
        android:usesCleartextTraffic="true">
        
        <activity
            android:name=".MainActivity"
            android:configChanges="orientation|screenSize"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
```

---

## 📁 프로젝트 구조

```
app/
├── src/
│   └── main/
│       ├── java/com/yourapp/chatgpt/
│       │   └── MainActivity.java (또는 MainActivity.kt)
│       ├── res/
│       │   └── layout/
│       │       └── activity_main.xml
│       ├── assets/
│       │   └── index.html  ⬅️ 이 프로젝트의 index.html 복사
│       └── AndroidManifest.xml
└── build.gradle
```

### activity_main.xml

```xml
<?xml version="1.0" encoding="utf-8"?>
<RelativeLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent">

    <WebView
        android:id="@+id/webview"
        android:layout_width="match_parent"
        android:layout_height="match_parent" />
</RelativeLayout>
```

---

## ✅ 테스트 체크리스트

WebView 앱을 빌드한 후:

1. [ ] 앱 실행 시 index.html이 정상 로드되는지 확인
2. [ ] "GPT 만들기" 버튼 클릭
3. [ ] "파일 첨부" 영역 클릭
4. [ ] **파일 선택 창에서 여러 파일을 한 번에 선택 가능한지 확인**
5. [ ] 선택한 파일들이 목록에 표시되는지 확인
6. [ ] 파일 삭제 버튼이 작동하는지 확인

---

## 🚀 WebIntoApp.com 사용 시 주의사항

WebIntoApp 같은 서비스를 사용할 경우:

1. **HTML 업로드**: 이 프로젝트의 `index.html` 파일 업로드
2. **커스텀 코드 옵션 찾기**: "Advanced Settings" 또는 "Custom Code" 메뉴
3. **위의 Java/Kotlin 코드를 MainActivity에 추가 요청**
4. **AndroidManifest.xml 권한 추가 요청**

⚠️ 일부 서비스는 커스텀 코드 추가를 지원하지 않습니다. 그런 경우 **Android Studio**로 직접 빌드해야 합니다.

---

## 💡 네이티브 앱으로 완벽하게 만들려면?

OnSpace에서 **APP 프로젝트**를 생성하면:
- React Native 기반 네이티브 앱 자동 생성
- 파일 업로드 자동 지원
- APK/IPA 빌드 자동화
- Google Play / App Store 배포 가능

현재 Website 프로젝트를 APP으로 전환하려면:
1. OnSpace 홈페이지 이동
2. "APP" 탭 클릭
3. 새 프로젝트 생성
4. AI에게 이 프로젝트와 동일한 기능 요청

---

## 📞 문제 해결

### "파일 선택 창이 안 뜨는 경우"
→ `onShowFileChooser()` 메서드가 구현되지 않음

### "하나의 파일만 선택되는 경우"
→ `Intent.EXTRA_ALLOW_MULTIPLE` 누락

### "파일 접근 권한 에러"
→ `AndroidManifest.xml`에 권한 추가 필요

### "선택한 파일이 전달되지 않는 경우"
→ `onActivityResult()`에서 `ClipData` 처리 로직 확인

---

## 📚 참고 자료

- Android WebView 공식 문서: https://developer.android.com/reference/android/webkit/WebView
- WebChromeClient: https://developer.android.com/reference/android/webkit/WebChromeClient
- FileChooserParams: https://developer.android.com/reference/android/webkit/WebChromeClient.FileChooserParams
