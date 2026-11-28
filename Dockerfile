FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

COPY server/GreedIsland.Server/GreedIsland.Server.csproj server/GreedIsland.Server/
RUN dotnet restore server/GreedIsland.Server/GreedIsland.Server.csproj

COPY server/ server/

RUN dotnet publish server/GreedIsland.Server/GreedIsland.Server.csproj \
    -c Release \
    -o /app/publish \
    --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS final
WORKDIR /app

COPY --from=build /app/publish .

ENV ASPNETCORE_HTTP_PORTS=10000

EXPOSE 10000

ENTRYPOINT ["dotnet", "GreedIsland.Server.dll"]
