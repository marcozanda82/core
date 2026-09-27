# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# ---------------------------------------------------------------------------
# Firebase Auth / Google Sign-In / Capacitor Firebase Auth
# Impedisce a R8/ProGuard di offuscare le classi usate dal login nativo
# (Error 10 DEVELOPER_ERROR sulle build Play Store / Release).
# ---------------------------------------------------------------------------
-keepattributes Signature, InnerClasses, EnclosingMethod, *Annotation*
-keepattributes Exceptions

# Capacitor Firebase Authentication (@capacitor-firebase/authentication)
-keep class io.capawesome.capacitorjs.plugins.firebase.authentication.** { *; }
-keep class io.capawesome.capacitorjs.plugins.firebase.authentication.handlers.** { *; }
-keep class io.capawesome.capacitorjs.plugins.firebase.authentication.classes.** { *; }
-keep class io.capawesome.capacitorjs.plugins.firebase.authentication.interfaces.** { *; }

# Capacitor plugin bridge
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * { *; }
-keep class com.getcapacitor.** { *; }

# Firebase Authentication
-keep class com.google.firebase.auth.** { *; }
-keep class com.google.firebase.FirebaseApp { *; }
-keep class com.google.android.gms.internal.firebase-auth-api.** { *; }
-dontwarn com.google.firebase.auth.**

# Google Sign-In / Play Services Auth
-keep class com.google.android.gms.auth.** { *; }
-keep class com.google.android.gms.auth.api.** { *; }
-keep class com.google.android.gms.auth.api.signin.** { *; }
-keep class com.google.android.gms.common.** { *; }
-keep class com.google.android.gms.signin.** { *; }
-dontwarn com.google.android.gms.auth.**
-dontwarn com.google.android.gms.common.**

