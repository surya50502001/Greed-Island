namespace GreedIsland.Server.Models;

public sealed class PlayerSession
{
    public required string PlayerId { get; init; }
    public required string ConnectionId { get; set; }
    public required string CharacterName { get; init; }
    public string? RoomCode { get; set; }
    public DateTimeOffset ConnectedAtUtc { get; init; } = DateTimeOffset.UtcNow;
}
