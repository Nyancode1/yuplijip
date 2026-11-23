param(
    [string]$SdkPath = $env:ANDROID_HOME,
    [string]$JdkPath = $env:JAVA_HOME,
    [string]$BuildTools = '35.0.0',
    [string]$UpdateRepository = '',
    [switch]$Release,
    [switch]$Zip
)
$ErrorActionPreference = 'Stop'
if (!$SdkPath) { $SdkPath = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
if (!$JdkPath) { $JdkPath = Join-Path $env:ProgramFiles 'Android\Android Studio\jbr' }
$env:JAVA_HOME = $JdkPath
$env:Path = "$JdkPath\bin;$env:Path"
$androidJar = Join-Path $SdkPath 'platforms\android-35\android.jar'
$toolsPath = Join-Path $SdkPath "build-tools\$BuildTools"
$stage = Join-Path $PSScriptRoot 'build'
$compiled = Join-Path $stage ('compile-' + [Guid]::NewGuid().ToString('N'))
$packageDir = Join-Path $compiled 'release-package'
$dist = Join-Path (Split-Path $PSScriptRoot) 'dist'
$keystore = Join-Path $env:USERPROFILE '.android\debug.keystore'
$youtubeKey = $env:YUPLIJIP_YOUTUBE_API_KEY
$localKey = Join-Path (Split-Path $PSScriptRoot) 'private\youtube-api-key.txt'
if (!$youtubeKey -and (Test-Path -LiteralPath $localKey)) { $youtubeKey = [IO.File]::ReadAllText($localKey).Trim() }
if ($youtubeKey -and $youtubeKey -cnotmatch '^AIza[A-Za-z0-9_-]{35}$') { throw 'Invalid YouTube Data API key format.' }
if ($Release -and !$youtubeKey) { throw 'Set YUPLIJIP_YOUTUBE_API_KEY or private/youtube-api-key.txt before publishing.' }
foreach ($dir in @('classes', 'dex')) {
    New-Item -Force -ItemType Directory (Join-Path $compiled $dir) | Out-Null
}
New-Item -Force -ItemType Directory $dist | Out-Null
$keyClass = Join-Path $compiled 'YouTubeConfig.java'
[IO.File]::WriteAllText($keyClass, ('package app.songbook.tj; final class YouTubeConfig { static final String KEY = "' + $youtubeKey + '"; }'))
function Run-Tool([string]$exe, [string[]]$arguments) {
    & $exe @arguments
    if ($LASTEXITCODE -ne 0) { throw "$exe exited with $LASTEXITCODE" }
}
Run-Tool 'node' @("$PSScriptRoot\prepare-assets.js", "$packageDir\assets")
if ($Release -and !$UpdateRepository) { $UpdateRepository = 'Nyancode1/yuplijip' }
if ($UpdateRepository -and $UpdateRepository -notmatch '^[A-Za-z0-9-]+/[A-Za-z0-9_.-]+$') { throw 'Invalid update repository.' }
[IO.File]::WriteAllText((Join-Path $packageDir 'assets\update-repository.txt'), $UpdateRepository)
Run-Tool "$toolsPath\aapt2.exe" @('compile', '--dir', "$PSScriptRoot\res", '-o', "$stage\resources.zip")
Run-Tool "$toolsPath\aapt2.exe" @('link', '-o', "$stage\base.apk", '-I', $androidJar, '--manifest',
    "$PSScriptRoot\AndroidManifest.xml", "$stage\resources.zip")
Run-Tool "$JdkPath\bin\javac.exe" @('-encoding','UTF-8','-source','8','-target','8','-classpath',$androidJar,
    '-d',"$compiled\classes","$PSScriptRoot\java\MainActivity.java","$PSScriptRoot\java\AppUpdates.java","$PSScriptRoot\java\UpdateFile.java","$PSScriptRoot\java\ThumbnailStore.java","$PSScriptRoot\java\YouTubeApi.java",$keyClass)
Run-Tool "$JdkPath\bin\jar.exe" @('cf',"$compiled\classes.jar",'-C',"$compiled\classes",'.')
Run-Tool "$toolsPath\d8.bat" @('--min-api','28','--lib',$androidJar,'--output',"$compiled\dex","$compiled\classes.jar")
$archiveArgs = @('uf',"$stage\base.apk",'-C',"$compiled\dex",'classes.dex')
foreach ($asset in @('index.html','app.js','app.css','playlist.js','youtube.js','youtube.png','library.js','worker.js','catalog.json','update-repository.txt','dict','lib/kuromoji.js','lib/wanakana.js','lib/matching.js','licenses/wanakana.txt','licenses/kuromoji.txt','licenses/kuromoji-notice.txt','licenses/async.txt','licenses/doublearray.txt','licenses/lodash.txt','licenses/zlibjs.txt','licenses/alfex-source.txt','licenses/NOTICES.md')) {
    $archiveArgs += @('-C',$packageDir,"assets/$asset")
}
Run-Tool "$JdkPath\bin\jar.exe" $archiveArgs
Run-Tool "$toolsPath\zipalign.exe" @('-f','4',"$stage\base.apk","$stage\aligned.apk")
if (!(Test-Path -LiteralPath $keystore)) {
    $keystore = Join-Path $stage 'local-test.p12'
    if (!(Test-Path -LiteralPath $keystore)) {
        Run-Tool "$JdkPath\bin\keytool.exe" @('-genkeypair','-keystore',$keystore,'-alias','androiddebugkey',
            '-storepass','android','-keypass','android','-dname','CN=Local Android Test','-keyalg','RSA','-validity','10000')
    }
}
Run-Tool "$toolsPath\apksigner.bat" @('sign','--ks',$keystore,'--ks-key-alias','androiddebugkey',
    '--ks-pass','pass:android','--key-pass','pass:android','--out',"$stage\signed.apk","$stage\aligned.apk")
Run-Tool "$toolsPath\apksigner.bat" @('verify','--verbose',"$stage\signed.apk")
$certs = & "$toolsPath\apksigner.bat" verify --print-certs "$stage\signed.apk"
if ($Release -and
    !($certs -match 'SHA-256 digest: 286293f24da8043bf474cac001344509fdb3fee9f3c5e47a9da9346e9f226095$')) {
    throw 'Use the same signing key as the installed 1.4 APK.'
}
$manifest = [xml](Get-Content -Raw -Encoding UTF8 -LiteralPath "$PSScriptRoot\AndroidManifest.xml")
$appLabel = $manifest.manifest.application.GetAttribute('label', 'http://schemas.android.com/apk/res/android')
$outputApk = Join-Path $dist ($appLabel + '.apk')
if (!$youtubeKey) { $outputApk = Join-Path $stage ($appLabel + '-dev.apk') }
$outputZip = Join-Path $dist ($appLabel + '.zip')
Copy-Item -LiteralPath "$stage\signed.apk" -Destination $outputApk -Force
Write-Output $outputApk
if ($Zip) {
    Compress-Archive -LiteralPath $outputApk -DestinationPath $outputZip -Force
    Write-Output $outputZip
}
