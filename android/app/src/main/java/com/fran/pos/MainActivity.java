package com.fran.pos;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {
  private static final int CAMERA_PERMISSION_REQUEST = 4281;

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    // Galaxy Tab store registers stay awake on the counter next to the S700.
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    requestRuntimePermissions();
    attachMirrorOrientation();
  }

  @SuppressLint("AddJavascriptInterface")
  private void attachMirrorOrientation() {
    Bridge bridge = getBridge();
    if (bridge == null || bridge.getWebView() == null) return;
    bridge.getWebView().addJavascriptInterface(new MirrorPathBridge(), "FranOrientation");
    bridge.addWebViewListener(
      new WebViewListener() {
        @Override
        public void onPageLoaded(WebView webView) {
          if (webView != null && mirrorPathRequestsPortrait(webView.getUrl())) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT);
          }
        }
      }
    );
  }

  private final class MirrorPathBridge {
    @JavascriptInterface
    public void applyPath(String path) {
      final boolean portrait = mirrorPathRequestsPortrait(path);
      runOnUiThread(
        () ->
          setRequestedOrientation(
            portrait
              ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT
              : ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
          )
      );
    }
  }

  static boolean mirrorPathRequestsPortrait(String raw) {
    if (raw == null) return false;
    String path = raw.trim();
    if (path.isEmpty()) return false;
    int scheme = path.indexOf("://");
    if (scheme >= 0) {
      int slash = path.indexOf('/', scheme + 3);
      path = slash < 0 ? "/" : path.substring(slash);
    }
    int query = path.indexOf('?');
    if (query >= 0) path = path.substring(0, query);
    int hash = path.indexOf('#');
    if (hash >= 0) path = path.substring(0, hash);
    if (path.length() > 1 && path.endsWith("/")) path = path.substring(0, path.length() - 1);
    return path.endsWith("/pos/mirror") || path.contains("/pos/mirror/");
  }

  private void requestRuntimePermissions() {
    java.util.ArrayList<String> needed = new java.util.ArrayList<>();
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
      needed.add(Manifest.permission.CAMERA);
    }
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
      needed.add(Manifest.permission.ACCESS_FINE_LOCATION);
    }
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
      needed.add(Manifest.permission.ACCESS_COARSE_LOCATION);
    }
    if (!needed.isEmpty()) {
      ActivityCompat.requestPermissions(this, needed.toArray(new String[0]), CAMERA_PERMISSION_REQUEST);
    }
  }
}
