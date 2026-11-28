namespace GreedIsland.Server.Models;

public sealed class PlayerSnapshot
{
    public required string PlayerId { get; init; }
    public required string CharacterName { get; init; }
    public double X { get; set; }
    public double Y { get; set; }
    public double Z { get; set; }
    public double Yaw { get; set; }
    public string LocomotionState { get; set; } = "Idle";
    public double HorizSpeed { get; set; }
    public bool IsFlying { get; set; }
    public bool HasWeapon { get; set; }
    public bool IsInvisible { get; set; }
    public int ComboStep { get; set; }
    public int CurrentHealth { get; set; } = 100;
    public int MaxHealth { get; set; } = 100;
    public bool IsAlive { get; set; } = true;
    public long TimestampMs { get; set; }
}

public sealed class MovementInputDto
{
    public double X { get; init; }
    public double Y { get; init; }
    public double Z { get; init; }
    public double Yaw { get; init; }
    public string LocomotionState { get; init; } = "Idle";
    public double HorizSpeed { get; init; }
    public bool IsFlying { get; init; }
    public bool HasWeapon { get; init; }
    public bool IsInvisible { get; init; }
    public int ComboStep { get; init; }
}

public sealed class AttackRequestDto
{
    public required string TargetPlayerId { get; init; }
    public int ComboStep { get; init; } = 1;
}

public sealed class PlayerAttackedDto
{
    public required string AttackerPlayerId { get; init; }
    public required string TargetPlayerId { get; init; }
    public int ComboStep { get; init; }
}

public sealed class PlayerDamagedDto
{
    public required string AttackerPlayerId { get; init; }
    public required string TargetPlayerId { get; init; }
    public int Damage { get; init; }
    public int CurrentHealth { get; init; }
    public int MaxHealth { get; init; }
    public bool IsAlive { get; init; }
    public int ComboStep { get; init; }
}

public sealed class PlayerDiedDto
{
    public required string PlayerId { get; init; }
    public required string KillerPlayerId { get; init; }
    public int RespawnDelaySeconds { get; init; }
}

public sealed class PlayerRespawnedDto
{
    public required PlayerSnapshot Player { get; init; }
}
