using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GMind.Infrastructure.Migrations
{
    public partial class AddAuthVersion : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "AuthVersion",
                table: "Users",
                type: "int",
                nullable: false,
                defaultValue: 0);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AuthVersion",
                table: "Users");
        }
    }
}
