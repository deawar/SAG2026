$email = "testuser$(Get-Random)@example.com"
$password = "SecurePass123!"

Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host "TESTING SILENT AUCTION GALLERY API" -ForegroundColor Cyan
Write-Host "=" * 60

Write-Host "`n[TEST 1] Health Check"
try {
    $resp = Invoke-WebRequest -Uri "http://localhost:3000/health" -Method Get -UseBasicParsing
    Write-Host "Status: $($resp.StatusCode)" -ForegroundColor Green
    Write-Host "Response: $($resp.Content)" -ForegroundColor Green
} catch {
    Write-Host "Error: $($_)" -ForegroundColor Red
}

Write-Host "`n[TEST 2] Register User"
Write-Host "Email: $email"
Write-Host "Password: $password"
try {
    $body = ConvertTo-Json @{
        email = $email
        password = $password
        firstName = "Test"
        lastName = "User"
        dateOfBirth = "2000-01-15"
        role = "STUDENT"
        schoolId = "school-test-123"
    }
    Write-Host "Request Body: $body"
    $resp = Invoke-WebRequest -Uri "http://localhost:3000/api/auth/register" -Method Post -ContentType "application/json" -Body $body -UseBasicParsing
    Write-Host "Status: $($resp.StatusCode)" -ForegroundColor Green
    Write-Host "Response: $($resp.Content)" -ForegroundColor Green
} catch {
    Write-Host "Status Code: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
    Write-Host "Status Description: $($_.Exception.Response.StatusDescription)" -ForegroundColor Red
    Write-Host "Error Details: $($_)" -ForegroundColor Red
}

Write-Host "`n[TEST 3] Login"
Write-Host "Email: $email"
Write-Host "Password: $password"
try {
    $body = ConvertTo-Json @{
        email = $email
        password = $password
    }
    Write-Host "Request Body: $body"
    $resp = Invoke-WebRequest -Uri "http://localhost:3000/api/auth/login" -Method Post -ContentType "application/json" -Body $body -UseBasicParsing
    Write-Host "Status: $($resp.StatusCode)" -ForegroundColor Green
    Write-Host "Response: $($resp.Content)" -ForegroundColor Green
} catch {
    Write-Host "Status Code: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
    Write-Host "Status Description: $($_.Exception.Response.StatusDescription)" -ForegroundColor Red
    Write-Host "Error Details: $($_)" -ForegroundColor Red
}

Write-Host "`n[TEST 4] Get Auctions (public endpoint)"
try {
    $resp = Invoke-WebRequest -Uri "http://localhost:3000/api/auctions" -Method Get -UseBasicParsing
    Write-Host "Status: $($resp.StatusCode)" -ForegroundColor Green
    Write-Host "Response: $(($resp.Content | ConvertFrom-Json).message)" -ForegroundColor Green
} catch {
    Write-Host "Status Code: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
    Write-Host "Status Description: $($_.Exception.Response.StatusDescription)" -ForegroundColor Red
    Write-Host "Error Details: $($_)" -ForegroundColor Red
}

Write-Host "`n" + "=" * 60 -ForegroundColor Cyan
