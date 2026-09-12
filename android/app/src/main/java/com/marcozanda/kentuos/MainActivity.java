package com.marcozanda.kentuos;

import android.os.Bundle;

import androidx.core.splashscreen.SplashScreen;

import com.getcapacitor.BridgeActivity;
import com.marcozanda.kentuos.splash.KentuSplashOverlay;

public class MainActivity extends BridgeActivity {

    private KentuSplashOverlay kentuSplash;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        final boolean[] overlayReady = { savedInstanceState != null };
        SplashScreen systemSplash = SplashScreen.installSplashScreen(this);
        systemSplash.setKeepOnScreenCondition(() -> !overlayReady[0]);

        super.onCreate(savedInstanceState);

        if (savedInstanceState != null) {
            return;
        }

        kentuSplash = KentuSplashOverlay.attach(this, () -> overlayReady[0] = true);
    }

    @Override
    public void onDestroy() {
        if (kentuSplash != null) {
            kentuSplash.cancel();
            kentuSplash = null;
        }
        super.onDestroy();
    }
}
