$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskPreviousExcel=@(Get-Process -Name EXCEL -ErrorAction SilentlyContinue | ForEach-Object Id)
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class W28R1ExcelOwner { [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid); }'
$taskExcel=$null;$taskOwn=$false;$taskRows=@()
try {
 $taskExcel=New-Object -ComObject Excel.Application
 [uint32]$taskExcelPid=0;[W28R1ExcelOwner]::GetWindowThreadProcessId([IntPtr]$taskExcel.Hwnd,[ref]$taskExcelPid)|Out-Null
 if($taskPreviousExcel -contains $taskExcelPid){throw 'A instancia COM pertence a um Excel preexistente; a verificacao foi interrompida sem fechar o Excel do usuario.'}
 $taskOwn=$true;$taskExcel.Visible=$false;$taskExcel.DisplayAlerts=$false;$taskExcel.EnableEvents=$false;$taskExcel.AskToUpdateLinks=$false;$taskExcel.AutomationSecurity=3
 $taskOutput=Join-Path $taskRoot 'audit\excel-visual';[IO.Directory]::CreateDirectory($taskOutput)|Out-Null
 foreach($taskMunicipality in @('2200707','1506807')) {
  foreach($taskCount in @(31,89)) {
   $taskFile=Join-Path $taskRoot "audit\xlsx\$($taskMunicipality)_$taskCount.xlsx"
   $taskBook=$taskExcel.Workbooks.Open($taskFile,0,$true)
   try {
    $taskSheet=$taskBook.Worksheets.Item(('respostas_'+$taskCount))
    $taskExpected=if($taskMunicipality -eq '2200707'){13}else{409}
    if($taskBook.Worksheets.Count -ne 1){throw 'O arquivo deve ter exatamente uma aba.'}
    if($taskSheet.UsedRange.Rows.Count -ne ($taskExpected+3) -or $taskSheet.UsedRange.Columns.Count -ne ($taskCount+7)){throw 'Dimensoes da matriz alteradas na abertura real pelo Excel.'}
    if(-not $taskBook.ReadOnly){throw 'A verificacao deve abrir o arquivo somente para leitura.'}
    $taskRows+=@{file=$taskFile;questions=$taskCount;schools=$taskExpected;sheetName=$taskSheet.Name;sheetCount=$taskBook.Worksheets.Count;readOnly=$taskBook.ReadOnly;usedRows=$taskSheet.UsedRange.Rows.Count;usedColumns=$taskSheet.UsedRange.Columns.Count;sourceSaved=$false}
   } finally {$taskBook.Close($false);[Runtime.InteropServices.Marshal]::FinalReleaseComObject($taskBook)|Out-Null}
  }
 }
 @{status='PASS';method='Owned Microsoft Excel COM; four real XLSX opened read only; worksheet name, count and dimensions checked; no printing or PDF export';ownedExcelPID=$taskExcelPid;preexistingExcelTouched=$false;results=$taskRows} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $taskRoot 'audit\excel_visual_validation.json') -Encoding UTF8
} finally {
 if($taskExcel -and $taskOwn){$taskExcel.Quit()}
 if($taskExcel){[Runtime.InteropServices.Marshal]::FinalReleaseComObject($taskExcel)|Out-Null}
}
Write-Output 'Excel real: quatro arquivos reabertos; uma aba por arquivo; nenhum XLSX foi salvo novamente; sem impressao ou exportacao PDF.'
