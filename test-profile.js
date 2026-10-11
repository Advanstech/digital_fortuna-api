async function run() {
  const loginRes = await fetch("http://localhost:4000/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@dfortuna.demo", password: "Demo1234!" })
  });
  
  const loginData = await loginRes.json();
  const token = loginData.data.access_token;

  const patchRes = await fetch("http://localhost:4000/v1/auth/profile", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({ displayName: "Admin", companyName: "Admin Co" })
  });

  console.log('Status:', patchRes.status);
  const data = await patchRes.text();
  console.log('Response:', data);
}

run();
