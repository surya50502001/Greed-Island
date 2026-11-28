using GreedIsland.Server.Hubs;
using GreedIsland.Server.Services;

var builder = WebApplication.CreateBuilder(args);

var allowedOriginsRaw = Environment.GetEnvironmentVariable("ALLOWED_ORIGINS")
    ?? "http://localhost:5173,http://localhost:4173,https://greedisland12.vercel.app";
var allowedOrigins = allowedOriginsRaw
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

builder.Services.AddCors(options =>
{
    options.AddPolicy("FrontendCors", policy =>
    {
        policy
            .WithOrigins(allowedOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

builder.Services.AddSignalR();
builder.Services.AddSingleton<PlayerSessionManager>();
builder.Services.AddSingleton<WorldManager>();
builder.Services.AddSingleton<GameStateManager>();
builder.Services.AddSingleton<CombatManager>();
builder.Services.AddSingleton<DestinationRegistry>();
builder.Services.AddSingleton<PlayerEncounterService>();
builder.Services.AddSingleton<CardTravelManager>();

var app = builder.Build();

app.UseCors("FrontendCors");

app.MapGet("/health", () => Results.Ok(new { status = "ok", service = "GreedIsland.Server" }));
app.MapHub<GameHub>("/hubs/game");

app.Run();
