# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# React Native core
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }

# Expo SQLite
-keep class expo.modules.sqlite.** { *; }

# Stockfish native module
-keep class com.reactnativestockfishchessengine.** { *; }

# React Native SVG
-keep class com.horcrux.svg.** { *; }

# Keep JS bridge interface methods
-keepclassmembers class * {
    @com.facebook.react.bridge.ReactMethod *;
}

# Expo modules
-keep class expo.modules.** { *; }

# OkHttp (used by React Native's fetch)
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**
