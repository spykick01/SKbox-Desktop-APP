# SKBox Bluetooth helper: list / scan / pair / unpair devices without leaving SKBox.
# Uses the Windows Runtime device APIs (the same ones Windows Settings uses). Prints ONE line of JSON.
param([string]$Action = 'list', [string]$Id = '')
$ErrorActionPreference = 'Stop'
function Out-Json($o) { [Console]::Out.WriteLine((ConvertTo-Json -InputObject $o -Compress -Depth 4)) }
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $null = [Windows.Devices.Enumeration.DeviceInformation, Windows.Devices.Enumeration, ContentType = WindowsRuntime]
  $null = [Windows.Devices.Enumeration.DeviceInformationCollection, Windows.Devices.Enumeration, ContentType = WindowsRuntime]
  $null = [Windows.Devices.Enumeration.DevicePairingResult, Windows.Devices.Enumeration, ContentType = WindowsRuntime]
  $null = [Windows.Devices.Enumeration.DeviceUnpairingResult, Windows.Devices.Enumeration, ContentType = WindowsRuntime]
  $asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
  function Await($op, [Type]$t, [int]$ms) {
    $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op))
    if (-not $task.Wait($ms)) { throw 'Windows took too long to answer.' }
    return $task.Result
  }
  $kind = [Windows.Devices.Enumeration.DeviceInformationKind]::AssociationEndpoint
  $props = [string[]]@('System.Devices.Aep.IsPaired', 'System.Devices.Aep.IsConnected', 'System.Devices.Aep.CanPair')
  $classic = 'System.Devices.Aep.ProtocolId:="{e0cbf06c-cd8b-4647-bb8a-263b43f0f974}"'
  $le = 'System.Devices.Aep.ProtocolId:="{bb7bb05e-5972-42b5-94fc-76eaa7084d49}"'
  function Find($aqs, $ms) { return Await ([Windows.Devices.Enumeration.DeviceInformation]::FindAllAsync($aqs, $props, $kind)) ([Windows.Devices.Enumeration.DeviceInformationCollection]) $ms }
  function Shape($d) {
    $p = $d.Properties
    $paired = $false; $conn = $false
    if ($p.ContainsKey('System.Devices.Aep.IsPaired') -and $p['System.Devices.Aep.IsPaired'] -ne $null) { $paired = [bool]$p['System.Devices.Aep.IsPaired'] }
    if ($p.ContainsKey('System.Devices.Aep.IsConnected') -and $p['System.Devices.Aep.IsConnected'] -ne $null) { $conn = [bool]$p['System.Devices.Aep.IsConnected'] }
    return [ordered]@{ id = $d.Id; name = $d.Name; paired = $paired; connected = $conn }
  }
  if ($Action -eq 'list' -or $Action -eq 'scan') {
    $seen = @{}; $out = @()
    foreach ($q in @($classic, $le)) {
      $r = Find $q ($(if ($Action -eq 'scan') { 40000 } else { 20000 }))
      foreach ($d in $r) {
        if ([string]::IsNullOrWhiteSpace($d.Name)) { continue }
        if ($d.Name -match '^[0-9A-Fa-f]{2}([-:][0-9A-Fa-f]{2}){5}$') { continue }   # unnamed devices show their address
        $s = Shape $d
        if ($Action -eq 'list' -and -not $s.paired) { continue }
        if ($seen.ContainsKey($s.id)) { continue }
        $seen[$s.id] = 1; $out += , $s
      }
    }
    Out-Json @{ ok = $true; devices = @($out) }
  }
  elseif ($Action -eq 'pair' -or $Action -eq 'unpair') {
    if (-not $Id) { throw 'No device given.' }
    $d = Await ([Windows.Devices.Enumeration.DeviceInformation]::CreateFromIdAsync($Id, $props, $kind)) ([Windows.Devices.Enumeration.DeviceInformation]) 20000
    if ($Action -eq 'pair') {
      $r = Await ($d.Pairing.PairAsync()) ([Windows.Devices.Enumeration.DevicePairingResult]) 60000
      $st = [string]$r.Status
      Out-Json @{ ok = ($st -eq 'Paired' -or $st -eq 'AlreadyPaired'); status = $st }
    } else {
      $r = Await ($d.Pairing.UnpairAsync()) ([Windows.Devices.Enumeration.DeviceUnpairingResult]) 30000
      $st = [string]$r.Status
      Out-Json @{ ok = ($st -eq 'Unpaired' -or $st -eq 'AlreadyUnpaired'); status = $st }
    }
  }
  else { throw 'Unknown action.' }
} catch {
  Out-Json @{ ok = $false; error = ([string]$_.Exception.Message) }
}
