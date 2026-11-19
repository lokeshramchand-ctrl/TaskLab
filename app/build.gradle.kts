import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import java.util.Properties

val localProperties = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

val versionProps = Properties().apply {
    load(rootProject.file("version.properties").inputStream())
}
val appVersionMajor = versionProps.getProperty("VERSION_MAJOR").toInt()
val appVersionMinor = versionProps.getProperty("VERSION_MINOR").toInt()
val appVersionPatch = versionProps.getProperty("VERSION_PATCH").toInt()

plugins {
    id("com.android.application")
    alias(libs.plugins.hilt)
    alias(libs.plugins.kotlin.ksp)
    alias(libs.plugins.compose.compiler)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "com.lomu.app"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.lomu.app"
        minSdk = 26
        targetSdk = 36
        versionCode = appVersionMajor * 10_000 + appVersionMinor * 100 + appVersionPatch
        versionName = "$appVersionMajor.$appVersionMinor.$appVersionPatch"
        vectorDrawables.useSupportLibrary = true

        // Default sync server; can be changed on the sign-in screen.
        val server = localProperties.getProperty("MUSIC_SERVER_URL") ?: System.getenv("MUSIC_SERVER_URL") ?: "https://lomu.deploy-ui.lokeshrc.me"
        buildConfigField("String", "DEFAULT_SERVER_URL", "\"$server\"")
    }

    signingConfigs {
        create("release") {
            val ks = localProperties.getProperty("RELEASE_STORE_FILE")
            if (ks != null) {
                storeFile = file(ks)
                storePassword = localProperties.getProperty("RELEASE_STORE_PASSWORD")
                keyAlias = localProperties.getProperty("RELEASE_KEY_ALIAS")
                keyPassword = localProperties.getProperty("RELEASE_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            isCrunchPngs = false
            signingConfig = if (localProperties.getProperty("RELEASE_STORE_FILE") != null) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
        debug {
        }
    }

    compileOptions {
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }

    kotlin {
        jvmToolchain(21)
        compilerOptions {
            freeCompilerArgs.add("-Xannotation-default-target=param-property")
            jvmTarget.set(JvmTarget.JVM_21)
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    dependenciesInfo {
        includeInApk = false
        includeInBundle = false
    }

    lint {
        abortOnError = false
        checkDependencies = false
    }

    packaging {
        jniLibs { useLegacyPackaging = false }
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
            excludes += "META-INF/NOTICE.md"
            excludes += "META-INF/CONTRIBUTORS.md"
            excludes += "META-INF/LICENSE.md"
            excludes += "META-INF/INDEX.LIST"
            excludes += "META-INF/io.netty.versions.properties"
        }
    }

    testOptions {
        unitTests.isReturnDefaultValues = true
    }
}

composeCompiler {
    stabilityConfigurationFiles.add(layout.projectDirectory.file("compose_stability.conf"))
}

ksp {
    arg("room.schemaLocation", "$projectDir/schemas")
}

tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile>().configureEach {
    compilerOptions {
        freeCompilerArgs.addAll("-opt-in=kotlin.RequiresOptIn")
    }
}

dependencies {
    implementation(libs.guava)
    implementation(libs.coroutines.guava)
    implementation(libs.concurrent.futures)

    implementation(libs.activity)
    implementation(libs.hilt.navigation)
    implementation(libs.datastore)
    implementation(libs.webkit)

    implementation(libs.compose.runtime)
    implementation(libs.compose.foundation)
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.util)
    implementation(libs.compose.ui.tooling)
    implementation(libs.compose.animation)
    implementation(libs.compose.reorderable)
    implementation(libs.material3)
    implementation(libs.androidx.material.icons.extended.v178)

    implementation(libs.viewmodel)
    implementation(libs.viewmodel.compose)
    implementation(libs.palette)

    implementation(libs.coil)
    implementation(libs.coil.network.okhttp)

    implementation(libs.media3)
    implementation(libs.media3.session)
    implementation(libs.media3.hls)
    implementation(libs.media3.okhttp)

    implementation(libs.room.runtime)
    implementation(libs.room.ktx)
    ksp(libs.room.compiler)

    implementation(libs.apache.lang3)
    implementation(libs.hilt)
    ksp(libs.hilt.compiler)

    implementation(project(":innertube"))
    implementation(project(":lrclib"))
    implementation(project(":betterlyrics"))

    implementation(libs.ktor.client.core)
    implementation(libs.ktor.client.okhttp)
    implementation(libs.ktor.client.content.negotiation)
    implementation(libs.ktor.serialization.json)

    implementation(libs.work.runtime.ktx)
    implementation(libs.androidx.profileinstaller)
    coreLibraryDesugaring(libs.desugaring)
    implementation(libs.timber)

    testImplementation(libs.junit)
}
