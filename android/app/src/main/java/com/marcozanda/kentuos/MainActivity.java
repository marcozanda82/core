package com.marcozanda.kentuos;

import android.os.Bundle;

import androidx.core.splashscreen.SplashScreen;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen systemSplash = SplashScreen.installSplashScreen(this);
        // Lo splash nativo non resta visibile: l'animazione SVG React copre il boot.
        systemSplash.setKeepOnScreenCondition(() -> false);

        super.onCreate(savedInstanceState);
    }
}
