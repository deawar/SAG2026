# Test registration endpoint
$payload = @{
    firstName = 'John'
    lastName = 'Doe'
    email = 'testuser123@example.com'
    phone = '+1-555-123-4567'
    password = 'TestPass@1234'
    role = 'STUDENT'
} | ConvertTo-Json

Write-Host "Sending registration request..."
Write-Host "Payload: $payload"
Write-Host ""

try {
    $response = Invoke-WebRequest -Uri 'http://localhost:3000/api/auth/register' `
        -Method POST `
        -ContentType 'application/json' `
        -Body $payload `
        -SkipHttpErrorCheck
    
    Write-Host "Status Code: $($response.StatusCode)"
    Write-Host "Response: $($response.Content)"
} catch {
    Write-Host "Error: $_"
}
