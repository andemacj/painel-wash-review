param([ValidateSet('internal','aggregate')][string]$Profile='internal',[switch]$SemAbrirBrowser)
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskPython='C:\MSEL\venv\Scripts\python.exe'
$taskServer=Join-Path $PSScriptRoot 'serve_local.py'
$taskPolicy=Get-Content -LiteralPath (Join-Path $taskRoot 'policy\profile_matrix.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$taskMode=$taskPolicy.profiles.$Profile
if (!(Test-Path -LiteralPath $taskPython) -or !$taskMode) { throw 'Runtime local ou perfil indisponivel.' }
foreach($taskRole in @('app','host')) {
 $taskPort=if($taskRole -eq 'app'){$taskMode.port}else{$taskMode.hostPort}
 $taskReceipt=Join-Path $taskRoot "audit\server-$taskPort.json"
 $taskListener=Get-NetTCPConnection -State Listen -LocalPort $taskPort -ErrorAction SilentlyContinue
 if($taskListener) {
  if(!(Test-Path -LiteralPath $taskReceipt)){throw "Porta $taskPort ocupada por servico sem recibo W28-R1. Nenhum processo foi encerrado."}
  $taskRecorded=Get-Content -LiteralPath $taskReceipt -Raw -Encoding UTF8 | ConvertFrom-Json
  $taskProcess=Get-CimInstance Win32_Process -Filter "ProcessId=$($taskRecorded.pid)"
  $taskOwnCommand=$taskProcess -and ($taskProcess.CommandLine.Contains($taskServer) -or $taskProcess.CommandLine.Contains('.\consolidacao_w28r1_teste\tools\serve_local.py'))
  if(!$taskOwnCommand -or !$taskRecorded.root.StartsWith($taskRoot,[StringComparison]::OrdinalIgnoreCase) -or $taskRecorded.profile -ne $Profile -or $taskRecorded.role -ne $taskRole -or !($taskListener.OwningProcess -contains $taskRecorded.pid)){throw "Propriedade do servico na porta $taskPort nao comprovada. Nenhum processo foi encerrado."}
 } else {
  $taskLogRoot=Join-Path $taskRoot 'audit\runtime';[IO.Directory]::CreateDirectory($taskLogRoot)|Out-Null
  $taskStamp=[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')
  $taskArguments=@('-B',('"'+$taskServer+'"'),'--profile',$Profile)
  if($taskRole -eq 'host'){$taskArguments+='--host'}
  $taskStarted=Start-Process -FilePath $taskPython -ArgumentList $taskArguments -WorkingDirectory $taskRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskLogRoot "$taskStamp-$taskPort.out.log") -RedirectStandardError (Join-Path $taskLogRoot "$taskStamp-$taskPort.err.log") -PassThru
 }
 $taskUrl=if($taskRole -eq 'app'){"http://127.0.0.1:$taskPort$($taskMode.prefix)index.html"}else{"http://127.0.0.1:$taskPort/homologacao/"}
 $taskReady=$false
 foreach($taskAttempt in 1..50) {
  try{$taskResponse=Invoke-WebRequest -Uri $taskUrl -UseBasicParsing -TimeoutSec 3;if($taskResponse.StatusCode -eq 200){$taskReady=$true;break}}catch{}
  Start-Sleep -Milliseconds 200
 }
 if(!$taskReady){throw "Servico W28-R1 nao ficou pronto na porta $taskPort. Consulte audit\runtime."}
}
$taskAppUrl="http://127.0.0.1:$($taskMode.port)$($taskMode.prefix)index.html"
$taskHostUrl="http://127.0.0.1:$($taskMode.hostPort)/homologacao/"
Write-Output "W28-R1 $Profile - revisao local; publicacao nao executada."
Write-Output $taskAppUrl
Write-Output $taskHostUrl
if(!$SemAbrirBrowser){Start-Process $taskAppUrl}
