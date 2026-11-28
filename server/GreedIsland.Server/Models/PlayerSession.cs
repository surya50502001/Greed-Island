namespace GreedIsland.Server.Models;

public sealed class PlayerSession
{
    public required string PlayerId { get; init; }
    public required string ReconnectToken { get; init; }
    public required string ConnectionId { get; set; }
    public required string CharacterName { get; init; }
    public bool IsConnected { get; set; } = true;
    public DateTimeOffset ConnectedAtUtc { get; init; } = DateTimeOffset.UtcNow;
    public long LastMovementAcceptedMs { get; set; }
    public long LastAttackAcceptedMs { get; set; }
}
