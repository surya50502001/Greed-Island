using GreedIsland.Server.Models;

namespace GreedIsland.Server.Services;

/// <summary>
/// Authoritative registry of Greed Island towns/landmarks matching src/domain/world/island.ts.
/// </summary>
public sealed class DestinationRegistry
{
    public const string StartingTownId = "starting_plaza";

    private static readonly WorldTownDto[] Towns =
    [
        new() { Id = "starting_plaza", Name = "Starting Plaza", X = 0, Y = 2.06, Z = 0, Radius = 14 },
        new() { Id = "ancient_ruins", Name = "Ancient Ruins", X = -54, Y = 1.6, Z = -46, Radius = 18 },
        new() { Id = "crystal_peak", Name = "Crystal Peak", X = 58, Y = 4.2, Z = -50, Radius = 24 },
        new() { Id = "forest_shrine", Name = "Forest Shrine", X = 0, Y = 1.8, Z = 64, Radius = 16 },
    ];

    public WorldTownDto[] GetAllTowns() => Towns;

    public WorldTownDto? GetTownById(string? id)
    {
        if (string.IsNullOrWhiteSpace(id)) return null;
        return Towns.FirstOrDefault(t => string.Equals(t.Id, id.Trim(), StringComparison.OrdinalIgnoreCase));
    }

    public WorldTownDto? FindTownAtPosition(double x, double z)
    {
        foreach (var town in Towns)
        {
            var dist = Math.Sqrt((x - town.X) * (x - town.X) + (z - town.Z) * (z - town.Z));
            if (dist <= town.Radius + 4.0)
            {
                return town;
            }
        }
        return null;
    }
}
