package com.marcozanda.kentuos.splash;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.animation.AnimatorSet;
import android.animation.ObjectAnimator;
import android.app.Activity;
import android.os.Build;
import android.provider.Settings;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.view.animation.DecelerateInterpolator;

import androidx.annotation.NonNull;

import com.marcozanda.kentuos.R;

/**
 * Overlay splash su {@link com.marcozanda.kentuos.MainActivity}:
 * la WebView / Home resta sotto e viene rivelata al fade-out (~2s).
 */
public final class KentuSplashOverlay {

    private static final long ENSO_DELAY_MS = 200L;
    private static final long ENSO_DURATION_MS = 550L;
    private static final long K_DELAY_MS = 600L;
    private static final long K_DURATION_MS = 300L;
    private static final long OS_DELAY_MS = 800L;
    private static final long OS_DURATION_MS = 200L;
    private static final long WORDMARK_DELAY_MS = 950L;
    private static final long WORDMARK_DURATION_MS = 350L;
    private static final long EXIT_DELAY_MS = 1750L;
    private static final long EXIT_DURATION_MS = 250L;
    private static final float K_START_SCALE = 0.92f;
    private static final float WORDMARK_START_X_DP = -12f;

    private final View root;
    private final ViewGroup parent;
    private final AnimatorSet introSet = new AnimatorSet();
    private boolean cancelled;

    private KentuSplashOverlay(@NonNull View root, @NonNull ViewGroup parent) {
        this.root = root;
        this.parent = parent;
    }

    @NonNull
    public static KentuSplashOverlay attach(
            @NonNull Activity activity,
            @NonNull Runnable onOverlayReady
    ) {
        ViewGroup parent = activity.findViewById(android.R.id.content);
        View overlay = LayoutInflater.from(activity)
                .inflate(R.layout.view_kentu_splash, parent, false);
        parent.addView(overlay);
        KentuSplashOverlay controller = new KentuSplashOverlay(overlay, parent);
        overlay.post(onOverlayReady);
        controller.start(activity);
        return controller;
    }

    public void cancel() {
        cancelled = true;
        introSet.cancel();
        root.animate().cancel();
        if (root.getParent() == parent) {
            parent.removeView(root);
        }
    }

    private void start(@NonNull Activity activity) {
        EnsoDrawView enso = root.findViewById(R.id.kentu_enso_view);
        View kMark = root.findViewById(R.id.kentu_k_view);
        View osMark = root.findViewById(R.id.kentu_os_mark);
        View wordmark = root.findViewById(R.id.kentu_wordmark);

        kMark.setPivotX(kMark.getWidth() > 0 ? kMark.getWidth() / 2f : 0f);
        kMark.setPivotY(kMark.getHeight() > 0 ? kMark.getHeight() / 2f : 0f);
        kMark.post(() -> {
            kMark.setPivotX(kMark.getWidth() / 2f);
            kMark.setPivotY(kMark.getHeight() / 2f);
        });

        if (!animationsEnabled(activity)) {
            showStaticThenExit(400L);
            return;
        }

        DecelerateInterpolator easeOut = new DecelerateInterpolator(1.4f);
        DecelerateInterpolator wordEase = new DecelerateInterpolator();

        ObjectAnimator ensoDraw = ObjectAnimator.ofFloat(enso, "revealProgress", 0f, 1f);
        ensoDraw.setStartDelay(ENSO_DELAY_MS);
        ensoDraw.setDuration(ENSO_DURATION_MS);
        ensoDraw.setInterpolator(easeOut);

        ObjectAnimator kAlpha = ObjectAnimator.ofFloat(kMark, View.ALPHA, 0f, 1f);
        ObjectAnimator kScaleX = ObjectAnimator.ofFloat(kMark, View.SCALE_X, K_START_SCALE, 1f);
        ObjectAnimator kScaleY = ObjectAnimator.ofFloat(kMark, View.SCALE_Y, K_START_SCALE, 1f);
        kAlpha.setStartDelay(K_DELAY_MS);
        kScaleX.setStartDelay(K_DELAY_MS);
        kScaleY.setStartDelay(K_DELAY_MS);
        kAlpha.setDuration(K_DURATION_MS);
        kScaleX.setDuration(K_DURATION_MS);
        kScaleY.setDuration(K_DURATION_MS);
        kAlpha.setInterpolator(easeOut);
        kScaleX.setInterpolator(easeOut);
        kScaleY.setInterpolator(easeOut);

        ObjectAnimator osAlpha = ObjectAnimator.ofFloat(osMark, View.ALPHA, 0f, 1f);
        osAlpha.setStartDelay(OS_DELAY_MS);
        osAlpha.setDuration(OS_DURATION_MS);
        osAlpha.setInterpolator(easeOut);

        float startX = WORDMARK_START_X_DP * activity.getResources().getDisplayMetrics().density;
        wordmark.setTranslationX(startX);
        ObjectAnimator wordAlpha = ObjectAnimator.ofFloat(wordmark, View.ALPHA, 0f, 1f);
        ObjectAnimator wordX = ObjectAnimator.ofFloat(wordmark, View.TRANSLATION_X, startX, 0f);
        wordAlpha.setStartDelay(WORDMARK_DELAY_MS);
        wordX.setStartDelay(WORDMARK_DELAY_MS);
        wordAlpha.setDuration(WORDMARK_DURATION_MS);
        wordX.setDuration(WORDMARK_DURATION_MS);
        wordAlpha.setInterpolator(wordEase);
        wordX.setInterpolator(wordEase);

        introSet.playTogether(
                ensoDraw,
                kAlpha, kScaleX, kScaleY,
                osAlpha,
                wordAlpha, wordX
        );
        introSet.start();
        playExit(EXIT_DELAY_MS);
    }

    private void showStaticThenExit(long exitDelayMs) {
        EnsoDrawView enso = root.findViewById(R.id.kentu_enso_view);
        View kMark = root.findViewById(R.id.kentu_k_view);
        View osMark = root.findViewById(R.id.kentu_os_mark);
        View wordmark = root.findViewById(R.id.kentu_wordmark);
        enso.setRevealProgress(1f);
        kMark.setAlpha(1f);
        kMark.setScaleX(1f);
        kMark.setScaleY(1f);
        osMark.setAlpha(1f);
        wordmark.setAlpha(1f);
        wordmark.setTranslationX(0f);
        playExit(exitDelayMs);
    }

    private void playExit(long delayMs) {
        root.animate()
                .alpha(0f)
                .setStartDelay(delayMs)
                .setDuration(EXIT_DURATION_MS)
                .setInterpolator(new DecelerateInterpolator())
                .setListener(new AnimatorListenerAdapter() {
                    @Override
                    public void onAnimationEnd(Animator animation) {
                        removeOverlay();
                    }

                    @Override
                    public void onAnimationCancel(Animator animation) {
                        removeOverlay();
                    }
                })
                .start();
    }

    private void removeOverlay() {
        if (cancelled) {
            return;
        }
        cancelled = true;
        if (root.getParent() == parent) {
            parent.removeView(root);
        }
    }

    private static boolean animationsEnabled(@NonNull Activity activity) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            return android.animation.ValueAnimator.areAnimatorsEnabled();
        }
        float scale = Settings.Global.getFloat(
                activity.getContentResolver(),
                Settings.Global.ANIMATOR_DURATION_SCALE,
                1f
        );
        return scale != 0f;
    }
}
