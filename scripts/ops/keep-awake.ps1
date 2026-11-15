# يمنع سكون Windows (Modern Standby) ما دام طابور الإنتاج فيه عمل، فلا تتجمّد التسجيلات ولا ينتهي زمنها.
# لا يغيّر أي إعداد في النظام: المنع يزول بانتهاء هذه العملية، وتنتهي وحدها بعد 5 دقائق بلا عمل في الطابور. الشاشة تنطفئ كالمعتاد.
# تشغيل: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/ops/keep-awake.ps1
Add-Type -Namespace Win -Name Pwr -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);'
$ES_CONTINUOUS_SYSTEM = [uint32]2147483649   # ES_CONTINUOUS | ES_SYSTEM_REQUIRED
$ES_CONTINUOUS = [uint32]2147483648
$queue = Join-Path $PSScriptRoot '..\..\data\queue.json'
$idle = 0
while ($true) {
  [void][Win.Pwr]::SetThreadExecutionState($ES_CONTINUOUS_SYSTEM)
  $pending = $false
  try {
    $j = Get-Content $queue -Raw -Encoding UTF8 | ConvertFrom-Json
    $pending = [bool]($j.jobs | Where-Object { $_.status -in 'Queued', 'Preparing', 'Recording', 'Processing', 'Validating' })
  } catch { $pending = $true }   # تعذّرت القراءة (الملف قيد الكتابة): نفترض أن العمل جارٍ
  if ($pending) { $idle = 0 } else { $idle++ }
  if ($idle -ge 10) { break }
  Start-Sleep -Seconds 30
}
[void][Win.Pwr]::SetThreadExecutionState($ES_CONTINUOUS)
