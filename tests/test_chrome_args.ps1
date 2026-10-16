$argsList = @(
    '--user-data-dir=E:\vivpr\ai\ebrowser\portable-minimal\data\profiles\instance-1',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-sync',
    '--disable-component-update',
    '--disable-background-networking',
    '--disable-breakpad',
    '--disable-session-crashed-bubble',
    '--hide-crash-restore-bubble',
    '--disable-features=Translate,OptimizationHints,MediaRouter',
    '--load-extension=E:\vivpr\ai\ebrowser\portable-minimal\extensions\Email_Extractor_Source,E:\vivpr\ai\ebrowser\portable-minimal\extensions\LocalBusinessDataCrawlerPro,E:\vivpr\ai\ebrowser\portable-minimal\extensions\UltraSolverPro,E:\vivpr\ai\ebrowser\portable-minimal\extensions\bing_map_source,E:\vivpr\ai\ebrowser\portable-minimal\extensions\google_maps_extension_source,E:\vivpr\ai\ebrowser\portable-minimal\extensions\proxy,E:\vivpr\ai\ebrowser\portable-minimal\extensions\send_email_backup,E:\vivpr\ai\ebrowser\portable-minimal\extensions\send_message_backup,E:\vivpr\ai\ebrowser\portable-minimal\extensions\test_proxy',
    '--disable-extensions-except=E:\vivpr\ai\ebrowser\portable-minimal\extensions\Email_Extractor_Source,E:\vivpr\ai\ebrowser\portable-minimal\extensions\LocalBusinessDataCrawlerPro,E:\vivpr\ai\ebrowser\portable-minimal\extensions\UltraSolverPro,E:\vivpr\ai\ebrowser\portable-minimal\extensions\bing_map_source,E:\vivpr\ai\ebrowser\portable-minimal\extensions\google_maps_extension_source,E:\vivpr\ai\ebrowser\portable-minimal\extensions\proxy,E:\vivpr\ai\ebrowser\portable-minimal\extensions\send_email_backup,E:\vivpr\ai\ebrowser\portable-minimal\extensions\send_message_backup,E:\vivpr\ai\ebrowser\portable-minimal\extensions\test_proxy'
)

Write-Host "Launching chrome with all args..."
$proc = Start-Process -FilePath "E:\vivpr\ai\ebrowser\portable-minimal\engine\chrome.exe" -ArgumentList $argsList -PassThru
Start-Sleep -Seconds 3
Write-Host "Process Id: $($proc.Id)"
Write-Host "HasExited:  $($proc.HasExited)"
if ($proc.HasExited) {
    Write-Host "ExitCode:   $($proc.ExitCode)"
} else {
    Write-Host "Process is still RUNNING!"
    Stop-Process -Id $proc.Id -Force
}
