namespace GreedIsland.Server.Models;

public sealed class WorldTownDto
{
    public required string Id { get; init; }
    public required string Name { get; init; }
    public double X { get; init; }
    public double Y { get; init; }
    public double Z { get; init; }
    public double Radius { get; init; }
}

public sealed class MetPlayerSummaryDto
{
    public required string PlayerId { get; init; }
    public required string CharacterName { get; init; }
    public bool IsOnline { get; init; }
}

public sealed class SpellTravelContextDto
{
    public required string[] VisitedTownIds { get; init; }
    public required MetPlayerSummaryDto[] MetPlayers { get; init; }
    public required WorldTownDto[] AllTowns { get; init; }
}

public sealed class SpellTravelRequestDto
{
    public required string CardId { get; init; }
    public string DestinationType { get; init; } = "town"; // "town" | "player"
    public string? TargetId { get; init; }
    public string[] CompanionPlayerIds { get; init; } = [];
}

public sealed class SpellTravelEventDto
{
    public required string EventId { get; init; }
    public required string CardId { get; init; }
    public required string CasterPlayerId { get; init; }
    public required string[] ParticipantPlayerIds { get; init; }
    public double OriginX { get; init; }
    public double OriginY { get; init; }
    public double OriginZ { get; init; }
    public double DestinationX { get; init; }
    public double DestinationY { get; init; }
    public double DestinationZ { get; init; }
    public required string DestinationLabel { get; init; }
    public string? TargetPlayerId { get; init; }
    public long StartTimestampMs { get; init; }
    public int LaunchDurationMs { get; init; }
    public int FlightDurationMs { get; init; }
    public int DescendDurationMs { get; init; }
    public int TotalDurationMs { get; init; }
    public int PathSeed { get; init; }
    public double ArcHeight { get; init; }
    public double CurveOffset { get; init; }
}

public sealed class SpellTravelResultDto
{
    public bool Success { get; init; }
    public string? Error { get; init; }
    public SpellTravelEventDto? TravelEvent { get; init; }
}

public sealed class AccompanyInviteDto
{
    public required string InviteId { get; init; }
    public required string LeaderPlayerId { get; init; }
    public required string LeaderName { get; init; }
    public required string DestinationLabel { get; init; }
    public long ExpiresAtMs { get; init; }
}

public sealed class WeaponSummonEventDto
{
    public required string EventId { get; init; }
    public required string PlayerId { get; init; }
    public required string WeaponType { get; init; }
    public long StartTimestampMs { get; init; }
    public int DurationMs { get; init; }
}

public sealed class WeaponSummonResultDto
{
    public bool Success { get; init; }
    public string? Error { get; init; }
    public WeaponSummonEventDto? SummonEvent { get; init; }
}
