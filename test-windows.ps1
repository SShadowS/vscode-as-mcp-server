# Test VSCode MCP Extension from Windows
# Run this from PowerShell on Windows to test the extension

Write-Host "Testing VSCode MCP Extension on Windows..." -ForegroundColor Yellow

# Test if port 60100 is listening
Write-Host "`nChecking if port 60100 is listening..." -ForegroundColor Cyan
try {
    $listener = Get-NetTCPConnection -LocalPort 60100 -ErrorAction SilentlyContinue
    if ($listener) {
        Write-Host "✅ Port 60100 is listening!" -ForegroundColor Green
        Write-Host "   Process: $($listener.OwningProcess)" -ForegroundColor Gray
        Write-Host "   State: $($listener.State)" -ForegroundColor Gray
        Write-Host "   Local Address: $($listener.LocalAddress):$($listener.LocalPort)" -ForegroundColor Gray
    } else {
        Write-Host "❌ Port 60100 is NOT listening" -ForegroundColor Red
        Write-Host "   The VSCode MCP extension may not be running" -ForegroundColor Yellow
        Write-Host "   Please check the VSCode status bar for MCP Server status" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Error checking port: $($_.Exception.Message)" -ForegroundColor Red
}

# Test HTTP connectivity
Write-Host "`nTesting HTTP connectivity to MCP server..." -ForegroundColor Cyan

$testData = @{
    jsonrpc = "2.0"
    id = 1
    method = "tools/list"
    params = @{}
} | ConvertTo-Json

$headers = @{
    'Content-Type' = 'application/json'
}

try {
    # Test version endpoint first
    Write-Host "Testing version endpoint..." -ForegroundColor Gray
    try {
        $versionResponse = Invoke-RestMethod -Uri "http://localhost:60100/version" -Method GET -TimeoutSec 5
        Write-Host "✅ Version endpoint responding!" -ForegroundColor Green
        Write-Host "   Version: $($versionResponse.version)" -ForegroundColor Gray
        Write-Host "   Name: $($versionResponse.name)" -ForegroundColor Gray
        Write-Host "   Display Name: $($versionResponse.displayName)" -ForegroundColor Gray
    } catch {
        Write-Host "❌ Version endpoint failed: $($_.Exception.Message)" -ForegroundColor Red
    }

    # Test localhost main endpoint
    Write-Host "Testing localhost:60100..." -ForegroundColor Gray
    $response = Invoke-RestMethod -Uri "http://localhost:60100/" -Method POST -Body $testData -Headers $headers -TimeoutSec 5
    
    Write-Host "✅ VSCode MCP Extension is responding!" -ForegroundColor Green
    
    if ($response.result -and $response.result.tools) {
        $toolCount = $response.result.tools.Count
        Write-Host "   Tools found: $toolCount" -ForegroundColor Gray
        
        if ($toolCount -ge 22) {
            Write-Host "✅ Found $toolCount tools (including tool #22)" -ForegroundColor Green
            
            # Check tool #22 specifically
            $tool22 = $response.result.tools[21]  # 0-indexed
            Write-Host "   Tool #22: $($tool22.name)" -ForegroundColor Gray
            
            $schema = $tool22.inputSchema.'$schema'
            if ($schema -like "*2020-12*") {
                Write-Host "✅ Tool #22 uses JSON Schema 2020-12" -ForegroundColor Green
            } elseif ($schema -like "*draft-07*") {
                Write-Host "❌ Tool #22 still uses draft-07: $schema" -ForegroundColor Red
            } else {
                Write-Host "⚠️  Tool #22 schema version unknown: $schema" -ForegroundColor Yellow
            }
        } else {
            Write-Host "❌ Only $toolCount tools found (need 22+)" -ForegroundColor Red
        }
        
        # Check a few tool schemas
        Write-Host "`nSchema Analysis:" -ForegroundColor Cyan
        $schemaStats = @{}
        foreach ($tool in $response.result.tools) {
            $schema = $tool.inputSchema.'$schema'
            if ($schema) {
                if ($schemaStats.ContainsKey($schema)) {
                    $schemaStats[$schema]++
                } else {
                    $schemaStats[$schema] = 1
                }
            }
        }
        
        foreach ($schema in $schemaStats.Keys) {
            $count = $schemaStats[$schema]
            if ($schema -like "*2020-12*") {
                Write-Host "   ✅ $count tools use: $schema" -ForegroundColor Green
            } elseif ($schema -like "*draft-07*") {
                Write-Host "   ❌ $count tools use: $schema" -ForegroundColor Red
            } else {
                Write-Host "   ⚠️  $count tools use: $schema" -ForegroundColor Yellow
            }
        }
    } else {
        Write-Host "❌ No tools found in response" -ForegroundColor Red
    }
    
} catch {
    $errorMsg = $_.Exception.Message
    Write-Host "❌ Failed to connect to VSCode MCP Extension" -ForegroundColor Red
    Write-Host "   Error: $errorMsg" -ForegroundColor Gray
    
    if ($errorMsg -like "*refused*" -or $errorMsg -like "*timeout*") {
        Write-Host "`n💡 Troubleshooting steps:" -ForegroundColor Yellow
        Write-Host "   1. Check if VSCode is running" -ForegroundColor Gray
        Write-Host "   2. Look for 'MCP Server' in VSCode status bar" -ForegroundColor Gray
        Write-Host "   3. Install the updated VSIX if needed" -ForegroundColor Gray
        Write-Host "   4. Restart the MCP Server in VSCode" -ForegroundColor Gray
    }
}

# Test from WSL perspective (if applicable)
Write-Host "`nTesting accessibility from WSL..." -ForegroundColor Cyan
try {
    # Get all network interfaces to find potential WSL accessible addresses
    $interfaces = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -ne "127.0.0.1" -and $_.PrefixOrigin -eq "Manual" }
    
    foreach ($interface in $interfaces) {
        $ip = $interface.IPAddress
        Write-Host "Testing $ip`:60100 for WSL accessibility..." -ForegroundColor Gray
        
        try {
            $wslResponse = Invoke-RestMethod -Uri "http://$ip`:60100/" -Method POST -Body $testData -Headers $headers -TimeoutSec 3
            Write-Host "✅ Accessible from $ip (WSL can use this)" -ForegroundColor Green
        } catch {
            Write-Host "❌ Not accessible from $ip" -ForegroundColor Red
        }
    }
} catch {
    Write-Host "⚠️  Could not test WSL accessibility: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host "`nTest complete!" -ForegroundColor Yellow